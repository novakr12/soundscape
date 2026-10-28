import type { JSONValue } from "postgres";
import { deleteValues, getValue, increment, keys } from "./kv";
import { sql } from "./postgres";
import { isPrivate } from "./privacy";

export const RECENT_LIMIT = 20;
export const LISTENING_TTL_SECONDS = 60;
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_SECONDS = 15 * 60;
export const PLAYS_CHANNEL = "plays";
export const LISTENING_CHANNEL = "listening";
export const USER_CHANNEL = "user_events";

export type TrackRef = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
};

export type RecentPlay = TrackRef & { playedAt: string };

export async function getRecent(userId: string, limit = RECENT_LIMIT): Promise<RecentPlay[]> {
  const rows = await sql`
    SELECT p.track_id, t.title, a.name AS artist, t.cover, p.played_at
    FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ${userId}
    ORDER BY p.played_at DESC, p.id DESC
    LIMIT ${limit}`;
  return rows.map((row) => ({
    trackId: row.track_id,
    title: row.title,
    artist: row.artist,
    ...(row.cover ? { cover: row.cover } : {}),
    playedAt: row.played_at.toISOString(),
  }));
}

export type Listening = TrackRef & {
  startedAt?: number;
  durationMs?: number;
  pausedAt?: number;
  source?: "jellyfin";
};

export type ListeningNow = Listening & { userId: string };

export async function saveListening(userId: string, listening: Listening, seconds: number) {
  await sql`
    INSERT INTO listening (user_id, data, expires_at)
    VALUES (${userId}, ${sql.json(listening as JSONValue)}, ${new Date(Date.now() + seconds * 1000)})
    ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`;
}

export async function setListening(userId: string, track: TrackRef, durationMs?: number) {
  const listening: Listening = { ...track, startedAt: Date.now(), durationMs };
  await saveListening(userId, listening, durationMs ? Math.ceil(durationMs / 1000) : LISTENING_TTL_SECONDS);
}

export async function getListening(userId: string): Promise<Listening | null> {
  const [row] = await sql`SELECT data FROM listening WHERE user_id = ${userId} AND expires_at > now()`;
  return row ? (row.data as Listening) : null;
}

export async function extendListening(userId: string, seconds: number) {
  await sql`UPDATE listening SET expires_at = ${new Date(Date.now() + seconds * 1000)} WHERE user_id = ${userId}`;
}

export async function clearListening(userId: string) {
  await sql`DELETE FROM listening WHERE user_id = ${userId}`;
}

export async function addListeningDetails(
  userId: string,
  trackId: string,
  details: { cover: string; durationMs?: number },
): Promise<boolean> {
  const current = await getListening(userId);
  if (current?.trackId !== trackId) return false;

  const durationMs = current.durationMs ?? details.durationMs;
  const data = sql.json({ ...current, cover: details.cover, durationMs } as JSONValue);
  const expiresAt =
    durationMs && !current.durationMs && current.startedAt
      ? new Date(Date.now() + Math.max(current.startedAt + durationMs - Date.now(), 1000))
      : null;
  const updated = await sql`
    UPDATE listening SET data = ${data}, expires_at = coalesce(${expiresAt}, expires_at)
    WHERE user_id = ${userId} AND expires_at > now() AND data->>'trackId' = ${trackId}
    RETURNING user_id`;
  return updated.length > 0;
}

export async function getListeningNow(): Promise<ListeningNow[]> {
  const rows = await sql`SELECT user_id, data FROM listening WHERE expires_at > now() ORDER BY user_id`;
  return rows.map((row) => ({ userId: row.user_id as string, ...(row.data as Listening) }));
}

export async function isLoginLocked(username: string) {
  return Number(await getValue(keys.loginFailures(username))) >= LOGIN_MAX_FAILURES;
}

export async function recordLoginFailure(username: string) {
  await increment(keys.loginFailures(username), LOGIN_LOCK_SECONDS);
}

export async function clearLoginFailures(username: string) {
  await deleteValues(keys.loginFailures(username));
}

export type LivePlay = RecentPlay & { userId: string | null };

export async function publishPlay(play: LivePlay & { userId: string }) {
  const userId = (await isPrivate(play.userId)) ? null : play.userId;
  await sql.notify(PLAYS_CHANNEL, JSON.stringify({ ...play, userId }));
  await sql.notify(USER_CHANNEL, JSON.stringify({ userId: play.userId, event: "play" }));
}

export async function publishListening(userId: string) {
  await sql.notify(USER_CHANNEL, JSON.stringify({ userId, event: "listening" }));
  if (!(await isPrivate(userId))) await sql.notify(LISTENING_CHANNEL, "{}");
}
