import { resolveTrackId } from "./aliases";
import { findTrackDetails } from "./deezer";
import {
  addListeningDetails,
  clearListening,
  extendListening,
  getListening,
  type Listening,
  publishListening,
  saveListening,
} from "./live";
import { sql } from "./postgres";
import { decrypt, encrypt, serverUrl } from "./servers";

const TICKS_PER_MS = 10_000;
const POLL_MS = 5_000;
const LISTENING_TTL_SECONDS = 30;
const SEEK_TOLERANCE_MS = 3_000;
const WARN_EVERY_MS = 10 * 60 * 1000;

export type Jellyfin = {
  url: string;
  apiKey: string;
  username: string;
  jellyfinUserId: string;
};

export type Playback = {
  title: string;
  artist: string;
  durationMs?: number;
  positionMs: number;
  paused: boolean;
};

type Session = {
  UserId?: string;
  LastPlaybackCheckIn?: string;
  NowPlayingItem?: { Type?: string; Name?: string; Artists?: string[]; AlbumArtist?: string; RunTimeTicks?: number };
  PlayState?: { PositionTicks?: number; IsPaused?: boolean };
};

export class JellyfinError extends Error {}

async function request(url: string, apiKey: string, path: string) {
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      headers: { Authorization: `MediaBrowser Token="${apiKey}"` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new JellyfinError("Jellyfin is unreachable at that address.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new JellyfinError("Jellyfin did not accept that API key.");
  }
  if (!response.ok) throw new JellyfinError(`Jellyfin answered with ${response.status}.`);
  const body = await response.json().catch(() => null);
  if (body === null) throw new JellyfinError("That address did not answer like a Jellyfin server.");
  return body;
}

export async function getJellyfin(userId: string): Promise<Jellyfin | null> {
  const [row] = await sql`
    SELECT server_url, api_key, jellyfin_user, jellyfin_user_id FROM jellyfin_settings WHERE user_id = ${userId}`;
  if (!row) return null;
  return {
    url: row.server_url,
    apiKey: decrypt(row.api_key, "jellyfin"),
    username: row.jellyfin_user,
    jellyfinUserId: row.jellyfin_user_id,
  };
}

export async function saveJellyfin(userId: string, address: string, apiKey: string, username: string) {
  const url = serverUrl(address);
  if (!url) throw new JellyfinError("Enter the full address with http:// or https://, like http://localhost:8096.");
  const users: { Id: string; Name: string }[] = await request(url, apiKey, "/Users");
  const user = users.find((u) => u.Name.toLowerCase() === username.toLowerCase());
  if (!user) throw new JellyfinError(`Jellyfin has no user called ${username}.`);

  await sql`
    INSERT INTO jellyfin_settings (user_id, server_url, api_key, jellyfin_user, jellyfin_user_id)
    VALUES (${userId}, ${url}, ${encrypt(apiKey, "jellyfin")}, ${user.Name}, ${user.Id})
    ON CONFLICT (user_id) DO UPDATE SET server_url = excluded.server_url, api_key = excluded.api_key,
      jellyfin_user = excluded.jellyfin_user, jellyfin_user_id = excluded.jellyfin_user_id, created_at = now()`;
  return { url, apiKey, username: user.Name, jellyfinUserId: user.Id };
}

export async function removeJellyfin(userId: string) {
  await sql`DELETE FROM jellyfin_settings WHERE user_id = ${userId}`;
  await applyPlayback(userId, null);
}

export function playbackFor(sessions: Session[], jellyfinUserId: string): Playback | null {
  const playing = sessions
    .filter((s) => s.UserId === jellyfinUserId && s.NowPlayingItem?.Type === "Audio" && s.NowPlayingItem.Name)
    .sort(
      (a, b) =>
        Number(a.PlayState?.IsPaused ?? false) - Number(b.PlayState?.IsPaused ?? false) ||
        (b.LastPlaybackCheckIn ?? "").localeCompare(a.LastPlaybackCheckIn ?? ""),
    );
  const session = playing[0];
  if (!session?.NowPlayingItem) return null;

  const item = session.NowPlayingItem;
  const artist = item.Artists?.[0] ?? item.AlbumArtist;
  if (!artist) return null;
  return {
    title: item.Name!,
    artist,
    durationMs: item.RunTimeTicks ? Math.round(item.RunTimeTicks / TICKS_PER_MS) : undefined,
    positionMs: Math.round((session.PlayState?.PositionTicks ?? 0) / TICKS_PER_MS),
    paused: session.PlayState?.IsPaused ?? false,
  };
}

function positionOf(listening: Listening, now: number) {
  return (listening.pausedAt ?? now) - (listening.startedAt ?? now);
}

async function catalogCover(trackId: string): Promise<string | undefined> {
  const [row] = await sql`SELECT cover FROM tracks WHERE id = ${trackId}`;
  return row?.cover ?? undefined;
}

export async function applyPlayback(userId: string, playback: Playback | null, now = Date.now()) {
  const current = await getListening(userId);
  const fromJellyfin = current?.source === "jellyfin";

  if (!playback) {
    if (fromJellyfin) {
      await clearListening(userId);
      await publishListening(userId);
    }
    return;
  }

  const trackId = await resolveTrackId(playback.artist, playback.title);
  const sameTrack = fromJellyfin && current.trackId === trackId;
  const unchanged =
    sameTrack &&
    Boolean(current.pausedAt) === playback.paused &&
    Math.abs(positionOf(current, now) - playback.positionMs) <= SEEK_TOLERANCE_MS;

  if (unchanged) {
    await extendListening(userId, LISTENING_TTL_SECONDS);
    return;
  }

  const listening: Listening = {
    trackId,
    title: playback.title,
    artist: playback.artist,
    cover: sameTrack ? current.cover : await catalogCover(trackId),
    startedAt: now - playback.positionMs,
    durationMs: playback.durationMs,
    pausedAt: playback.paused ? now : undefined,
    source: "jellyfin",
  };
  await saveListening(userId, listening, LISTENING_TTL_SECONDS);
  await publishListening(userId);

  if (!listening.cover) {
    const details = await findTrackDetails(trackId, playback.artist, playback.title).catch(() => null);
    if (details && (await addListeningDetails(userId, trackId, details))) await publishListening(userId);
  }
}

const lastWarned = new Map<string, number>();

function warn(source: string, message: string) {
  const now = Date.now();
  if (now - (lastWarned.get(source) ?? 0) < WARN_EVERY_MS) return;
  lastWarned.set(source, now);
  console.warn(`Jellyfin ${source}: ${message}`);
}

type ServerUsers = { url: string; apiKey: string; users: { userId: string; jellyfinUserId: string }[] };

export async function pollJellyfin() {
  const servers = new Map<string, ServerUsers>();
  const rows = await sql`SELECT user_id, server_url, api_key, jellyfin_user_id FROM jellyfin_settings`;
  for (const row of rows) {
    const apiKey = decrypt(row.api_key, "jellyfin");
    const key = `${row.server_url} ${apiKey}`;
    const server: ServerUsers = servers.get(key) ?? { url: row.server_url, apiKey, users: [] };
    server.users.push({ userId: row.user_id, jellyfinUserId: row.jellyfin_user_id });
    servers.set(key, server);
  }

  await Promise.all(
    [...servers.values()].map(async (server) => {
      let sessions: Session[];
      try {
        sessions = await request(server.url, server.apiKey, "/Sessions?activeWithinSeconds=60");
      } catch (error) {
        if (error instanceof JellyfinError) return warn(server.url, error.message);
        throw error;
      }
      for (const user of server.users) await applyPlayback(user.userId, playbackFor(sessions, user.jellyfinUserId));
    }),
  );
}

const globalForPolling = globalThis as unknown as { jellyfinPolling?: boolean };

export function startJellyfinPolling() {
  if (globalForPolling.jellyfinPolling) return;
  globalForPolling.jellyfinPolling = true;
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await pollJellyfin();
    } catch (error) {
      warn("polling", error instanceof Error ? error.message : String(error));
    } finally {
      running = false;
    }
  }, POLL_MS);
}
