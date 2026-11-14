import { createHash, randomBytes } from "node:crypto";
import { deleteValues, takeLock } from "./kv";
import { sql } from "./postgres";
import { decrypt, encrypt } from "./servers";

const api = () => process.env.LASTFM_API_URL ?? "https://ws.audioscrobbler.com/2.0/";
const authPage = () => process.env.LASTFM_AUTH_URL ?? "https://www.last.fm/api/auth/";
const apiKey = () => process.env.LASTFM_API_KEY ?? "";
const secret = () => process.env.LASTFM_SHARED_SECRET ?? "";

export const STATE_COOKIE = "lastfm_state";

const OLDEST_MS = 14 * 24 * 60 * 60 * 1000;
const BATCH = 50;
const LOCK_SECONDS = 5 * 60;
const MAX_TEXT = 300;
const INVALID_SESSION = 9;
const TRY_LATER = new Set([8, 10, 11, 13, 16, 26, 29]);

export type LastfmScrobbling = { lastfmUser: string; needsReconnect: boolean };

export type Scrobble = {
  artist: string;
  title: string;
  album?: string;
  playedAt: Date;
  durationMs?: number;
};

type Outcome = "sent" | "later" | "reconnect" | "dropped";

export class LastfmScrobbleError extends Error {}

export function scrobblingConfigured() {
  return apiKey() !== "" && secret() !== "";
}

export function signature(params: Record<string, string>, sharedSecret = secret()) {
  const text = Object.keys(params)
    .filter((name) => name !== "format" && name !== "callback")
    .sort()
    .map((name) => name + params[name])
    .join("");
  return createHash("md5")
    .update(text + sharedSecret, "utf8")
    .digest("hex");
}

export function newState() {
  return randomBytes(16).toString("hex");
}

export function authUrl(callback: string) {
  const url = new URL(authPage());
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("cb", callback);
  return url.toString();
}

type Answer = { error?: number; message?: string } & Record<string, unknown>;

async function call(params: Record<string, string>, method: "GET" | "POST" = "POST"): Promise<Answer | null> {
  const signed = { ...params, api_key: apiKey() };
  const body = new URLSearchParams({ ...signed, api_sig: signature(signed), format: "json" });
  try {
    const response =
      method === "GET"
        ? await fetch(`${api()}?${body}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" })
        : await fetch(api(), {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
            signal: AbortSignal.timeout(10_000),
            cache: "no-store",
          });
    const answer = (await response.json().catch(() => null)) as Answer | null;
    if (answer) return answer;
    return { error: response.status >= 500 ? 16 : 0 };
  } catch {
    return null;
  }
}

export async function getLastfmScrobbling(userId: string): Promise<LastfmScrobbling | null> {
  const [row] = await sql`SELECT lastfm_user, needs_reconnect FROM lastfm_scrobbling WHERE user_id = ${userId}`;
  return row ? { lastfmUser: row.lastfm_user, needsReconnect: row.needs_reconnect } : null;
}

async function sessionKey(userId: string): Promise<string | null> {
  const [row] = await sql`
    SELECT session_key FROM lastfm_scrobbling WHERE user_id = ${userId} AND NOT needs_reconnect`;
  return row ? decrypt(row.session_key, "lastfm") : null;
}

export async function connectLastfm(userId: string, token: string): Promise<LastfmScrobbling> {
  if (!scrobblingConfigured()) throw new LastfmScrobbleError("Last.fm scrobbling isn't set up on this server.");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(token)) throw new LastfmScrobbleError("Last.fm sent back an odd answer.");
  const answer = await call({ method: "auth.getSession", token }, "GET");
  if (!answer) throw new LastfmScrobbleError("Last.fm is unreachable, try again later.");
  const session = answer.session as { name?: string; key?: string } | undefined;
  if (!session?.name || !session.key) throw new LastfmScrobbleError("Last.fm didn't accept the connection.");
  await sql`
    INSERT INTO lastfm_scrobbling (user_id, lastfm_user, session_key)
    VALUES (${userId}, ${session.name}, ${encrypt(session.key, "lastfm")})
    ON CONFLICT (user_id) DO UPDATE SET lastfm_user = excluded.lastfm_user, session_key = excluded.session_key,
      needs_reconnect = false, created_at = now()`;
  await sendLastfmQueue(userId);
  return { lastfmUser: session.name, needsReconnect: false };
}

export async function removeLastfmScrobbling(userId: string) {
  await sql`DELETE FROM lastfm_scrobbling WHERE user_id = ${userId}`;
  await sql`DELETE FROM lastfm_queue WHERE user_id = ${userId}`;
}

export async function waitingForLastfm(userId: string): Promise<number> {
  const [{ waiting }] = await sql`SELECT count(*)::int AS waiting FROM lastfm_queue WHERE user_id = ${userId}`;
  return waiting;
}

const clip = (text: string) => text.trim().slice(0, MAX_TEXT);

export async function sendNowPlayingToLastfm(userId: string, song: Omit<Scrobble, "playedAt">) {
  if (!scrobblingConfigured() || !song.artist.trim() || !song.title.trim()) return;
  const key = await sessionKey(userId);
  if (!key) return;
  const params: Record<string, string> = {
    method: "track.updateNowPlaying",
    sk: key,
    artist: clip(song.artist),
    track: clip(song.title),
  };
  if (song.album?.trim()) params.album = clip(song.album);
  if (song.durationMs) params.duration = String(Math.round(song.durationMs / 1000));
  const answer = await call(params);
  if (answer?.error === INVALID_SESSION) await needsReconnect(userId);
}

export async function scrobbleToLastfm(userId: string, plays: Scrobble[], now = Date.now()) {
  if (!scrobblingConfigured()) return;
  const [connected] = await sql`SELECT 1 FROM lastfm_scrobbling WHERE user_id = ${userId}`;
  if (!connected) return;
  const fresh = plays.filter(
    (play) =>
      play.artist.trim() &&
      play.title.trim() &&
      !Number.isNaN(play.playedAt.getTime()) &&
      now - play.playedAt.getTime() < OLDEST_MS &&
      play.playedAt.getTime() <= now + 5 * 60_000,
  );
  if (fresh.length === 0) return;
  await sql`
    INSERT INTO lastfm_queue (user_id, artist, title, album, played_at, duration_s)
    SELECT ${userId}, * FROM unnest(
      ${fresh.map((play) => clip(play.artist))}::text[],
      ${fresh.map((play) => clip(play.title))}::text[],
      ${fresh.map((play) => (play.album?.trim() ? clip(play.album) : null))}::text[],
      ${fresh.map((play) => play.playedAt.toISOString())}::timestamptz[],
      ${fresh.map((play) => (play.durationMs ? Math.round(play.durationMs / 1000) : null))}::int[]
    )`;
  await sendLastfmQueue(userId, now);
}

async function needsReconnect(userId: string) {
  await sql`UPDATE lastfm_scrobbling SET needs_reconnect = true WHERE user_id = ${userId}`;
}

type Row = {
  id: string;
  artist: string;
  title: string;
  album: string | null;
  played_at: Date;
  duration_s: number | null;
};

async function send(key: string, rows: Row[]): Promise<Outcome> {
  const params: Record<string, string> = { method: "track.scrobble", sk: key };
  for (const [i, row] of rows.entries()) {
    params[`artist[${i}]`] = row.artist;
    params[`track[${i}]`] = row.title;
    params[`timestamp[${i}]`] = String(Math.floor(row.played_at.getTime() / 1000));
    if (row.album) params[`album[${i}]`] = row.album;
    if (row.duration_s) params[`duration[${i}]`] = String(row.duration_s);
  }
  const answer = await call(params);
  if (!answer) return "later";
  if (answer.error === undefined && answer.scrobbles) return "sent";
  if (answer.error === INVALID_SESSION) return "reconnect";
  if (answer.error !== undefined && TRY_LATER.has(answer.error)) return "later";
  console.warn(`Last.fm scrobbling: rejected with ${answer.error ?? "an odd answer"}`);
  return "dropped";
}

export async function sendLastfmQueue(userId: string, now = Date.now()) {
  const lock = `lastfm:send:${userId}`;
  if (!(await takeLock(lock, LOCK_SECONDS))) return;
  try {
    await sql`DELETE FROM lastfm_queue WHERE user_id = ${userId} AND played_at < ${new Date(now - OLDEST_MS)}`;
    const key = await sessionKey(userId);
    if (!key) return;
    for (;;) {
      const rows = (await sql`
        SELECT id, artist, title, album, played_at, duration_s FROM lastfm_queue
        WHERE user_id = ${userId} ORDER BY id LIMIT ${BATCH}`) as unknown as Row[];
      if (rows.length === 0) return;
      const outcome = await send(key, rows);
      if (outcome === "later") return;
      if (outcome === "reconnect") {
        await needsReconnect(userId);
        return;
      }
      await sql`DELETE FROM lastfm_queue WHERE id = ANY(${rows.map((row) => row.id)}::bigint[])`;
    }
  } finally {
    await deleteValues(lock);
  }
}

export async function sendAllLastfmQueues(now = Date.now()) {
  if (!scrobblingConfigured()) return { checked: 0 };
  await sql`DELETE FROM lastfm_queue WHERE played_at < ${new Date(now - OLDEST_MS)}`;
  const users = await sql`
    SELECT DISTINCT q.user_id FROM lastfm_queue q
    JOIN lastfm_scrobbling s ON s.user_id = q.user_id AND NOT s.needs_reconnect`;
  for (const { user_id } of users) await sendLastfmQueue(user_id, now);
  return { checked: users.length };
}
