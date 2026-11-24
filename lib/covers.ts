import { fillCoversFromApple } from "./apple-preview";
import { fillArtistPhotos } from "./artist-photos";
import { COVER_SIZES, FULL_COVER } from "./cover-size";
import { fillCoversFromCoverArtArchive } from "./coverartarchive";
import { matchMissingTracks, needsDeezer } from "./deezer";
import { getValue, keys, setValue } from "./kv";
import {
  fetchCoverArt,
  findLibrarySong,
  getNavidrome,
  NavidromeBusy,
  NavidromeError,
  type SubsonicSong,
} from "./navidrome";
import { sql } from "./postgres";

const CACHE_SECONDS = 7 * 24 * 60 * 60;
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type Cover = { type: string; data: Buffer };

export const FALLBACK_COVER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
<rect width="40" height="40" fill="#1db954" fill-opacity="0.15"/>
<g transform="translate(9 9)" fill="#1db954">
<path d="M8.2 6.4 19.8 3.2v3.4L8.2 9.8z"/>
<rect x="8.2" y="6.4" width="1.6" height="11"/>
<rect x="18.2" y="3.4" width="1.6" height="12"/>
<ellipse cx="6.6" cy="17.3" rx="3.1" ry="2.4" transform="rotate(-20 6.6 17.3)"/>
<ellipse cx="16.6" cy="15.3" rx="3.1" ry="2.4" transform="rotate(-20 16.6 15.3)"/>
</g>
</svg>`;

export function coverUrl(trackId: string) {
  return `/api/cover/${encodeURIComponent(trackId)}`;
}

function parseIpv4(host: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? (octets as [number, number, number, number]) : null;
}

function isPrivateIpv4([a, b, c]: [number, number, number, number]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIpv6Words(host: string): number[] | null {
  if (!host.includes(":")) return null;
  let normalized = host;
  const lastColon = normalized.lastIndexOf(":");
  const tail = normalized.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = parseIpv4(tail);
    if (!octets) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const parsePart = (part: string) => {
    if (!part) return [];
    const chunks = part.split(":");
    if (chunks.some((chunk) => !/^[0-9a-f]{1,4}$/.test(chunk))) return null;
    return chunks.map((chunk) => Number.parseInt(chunk, 16));
  };
  const head = parsePart(halves[0]);
  const tailWords = halves.length === 2 ? parsePart(halves[1]) : [];
  if (!head || !tailWords) return null;
  const missing = halves.length === 2 ? 8 - (head.length + tailWords.length) : 0;
  if (missing < 0 || (halves.length === 1 && head.length !== 8)) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...tailWords];
}

function isPrivateIpv6(words: number[]): boolean {
  if (words.slice(0, 7).every((word) => word === 0) && words[7] <= 1) return true;
  if ((words[0] & 0xfe00) === 0xfc00) return true;
  if ((words[0] & 0xffc0) === 0xfe80) return true;
  if ((words[0] & 0xff00) === 0xff00) return true;
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return isPrivateIpv4([words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff]);
  }
  return false;
}

export function isPublicOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".ts.net") ||
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    host.endsWith(".home") ||
    host.endsWith(".home.arpa") ||
    host.endsWith(".internal") ||
    host.endsWith(".localdomain") ||
    (!host.includes(".") && !host.includes(":"))
  ) {
    return false;
  }
  const ipv4 = parseIpv4(host);
  if (ipv4) return !isPrivateIpv4(ipv4);
  const ipv6 = parseIpv6Words(host);
  if (ipv6) return !isPrivateIpv6(ipv6);
  return true;
}

export function publicCover(
  trackId: string,
  row: { cover: string | null; navidrome_cover: string | null } | undefined,
  origin: string,
) {
  if (!row) return null;
  if (row.cover?.startsWith("https://") && !row.cover.startsWith(`${origin}/`) && isPublicOrigin(row.cover)) {
    return row.cover;
  }
  if ((row.cover || row.navidrome_cover) && isPublicOrigin(origin)) return `${origin}${coverUrl(trackId)}`;
  return null;
}

export async function fillCoversFromNavidrome(userId: string, limit = 50, now = Date.now()) {
  const server = await getNavidrome(userId);
  if (!server) return 0;

  const rows = await sql`
    SELECT t.id, t.title, a.name AS artist, t.navidrome_cover
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ${userId} AND t.cover IS NULL AND t.deezer_missing
      AND (t.navidrome_checked_at IS NULL OR t.navidrome_checked_at < ${new Date(now - RETRY_AFTER_MS)})
    ORDER BY t.id
    LIMIT ${limit}`;

  let found = 0;
  for (const row of rows) {
    const trackId: string = row.id;
    const knownCover: string | null = row.navidrome_cover ?? null;
    if (knownCover) {
      await sql`
        UPDATE tracks SET cover = ${coverUrl(trackId)}, navidrome_user = coalesce(navidrome_user, ${userId}),
                          navidrome_checked_at = NULL
        WHERE id = ${trackId}`;
      found++;
      continue;
    }
    let song: SubsonicSong | null;
    try {
      song = await findLibrarySong(server, { trackId, title: row.title, artist: row.artist });
    } catch (error) {
      if (error instanceof NavidromeError) break;
      throw error;
    }
    if (song?.coverArt) {
      await sql`
        UPDATE tracks SET cover = ${coverUrl(trackId)}, navidrome_cover = ${song.coverArt}, navidrome_user = ${userId},
                          navidrome_checked_at = NULL
        WHERE id = ${trackId}`;
      found++;
    } else {
      await sql`UPDATE tracks SET navidrome_checked_at = ${new Date(now)} WHERE id = ${trackId}`;
    }
  }
  return found;
}

export type CoverProgress = { done: boolean; checked: number; total: number; found: number };

const PROGRESS_SECONDS = 60 * 60;
const DONE_SECONDS = 10 * 60;

export async function getCoverProgress(userId: string): Promise<CoverProgress | null> {
  return getValue<CoverProgress>(keys.coverProgress(userId));
}

async function saveProgress(userId: string, progress: CoverProgress) {
  const seconds = progress.done ? DONE_SECONDS : PROGRESS_SECONDS;
  await setValue(keys.coverProgress(userId), progress, seconds);
}

export async function startCoverSearch(userId: string): Promise<CoverProgress> {
  const [{ total }] = await sql`
    SELECT count(*) AS total FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
    WHERE p.user_id = ${userId} AND ${needsDeezer()}`;
  const progress = { done: total === 0, checked: 0, total, found: 0 };
  await saveProgress(userId, progress);
  return progress;
}

export async function findCoversAfterImport(userId: string, progress: CoverProgress) {
  for (;;) {
    const summary = await matchMissingTracks(50, userId);
    progress.checked = Math.min(progress.total, progress.checked + summary.checked);
    progress.found += summary.matched;
    await saveProgress(userId, progress);
    if (summary.unreachable || summary.checked === 0) break;
  }
  for (;;) {
    const summary = await fillCoversFromApple({ userId });
    progress.found += summary.found;
    await saveProgress(userId, progress);
    if (summary.unreachable || summary.checked === 0) break;
  }
  for (;;) {
    const summary = await fillCoversFromCoverArtArchive({ userId });
    progress.found += summary.found;
    await saveProgress(userId, progress);
    if (summary.unreachable || summary.checked === 0) break;
  }
  progress.found += await fillCoversFromNavidrome(userId, 500);
  for (;;) {
    const summary = await fillArtistPhotos({ userId });
    if (summary.unreachable || summary.checked === 0) break;
  }
  progress.checked = progress.total;
  await saveProgress(userId, { ...progress, done: true });
}

export async function findMissingCovers(userId: string, newTracks: boolean) {
  if (newTracks) await matchMissingTracks(200, userId);
  await fillCoversFromApple({ userId });
  await fillCoversFromCoverArtArchive({ userId });
  await fillCoversFromNavidrome(userId);
  if (newTracks) await fillArtistPhotos({ userId, limit: 10 });
}

export async function getCover(trackId: string): Promise<Cover | null> {
  const cover = await findCover(trackId);
  return cover === "busy" ? null : cover;
}

export function coverCacheKey(trackId: string, size = FULL_COVER) {
  return size >= FULL_COVER ? trackId : `${trackId}@${size}`;
}

export function coverCacheKeys(trackId: string) {
  return [trackId, ...COVER_SIZES.map((size) => `${trackId}@${size}`)];
}

export async function findCover(trackId: string, size = FULL_COVER): Promise<Cover | null | "busy"> {
  const actualSize = Math.min(size, FULL_COVER);
  const cacheKey = coverCacheKey(trackId, actualSize);
  const [cached] = await sql`SELECT type, data FROM cover_cache WHERE track_id = ${cacheKey} AND expires_at > now()`;
  if (cached) return { type: cached.type, data: cached.data };

  const [row] = await sql`SELECT navidrome_cover, navidrome_user FROM tracks WHERE id = ${trackId}`;
  const coverArt: string | null = row?.navidrome_cover ?? null;
  const userId: string | null = row?.navidrome_user ?? null;
  if (!coverArt || !userId) return null;

  const server = await getNavidrome(userId);
  if (!server) return null;
  let cover: Cover | null;
  try {
    cover = await fetchCoverArt(server, coverArt, actualSize);
  } catch (error) {
    if (error instanceof NavidromeBusy) return "busy";
    throw error;
  }
  if (!cover) return null;
  await sql`
    INSERT INTO cover_cache (track_id, type, data, expires_at)
    VALUES (${cacheKey}, ${cover.type}, ${cover.data}, ${new Date(Date.now() + CACHE_SECONDS * 1000)})
    ON CONFLICT (track_id) DO UPDATE SET type = excluded.type, data = excluded.data, expires_at = excluded.expires_at`;
  return cover;
}

export async function forgetNavidromeCovers(userId: string) {
  const rows = await sql`
    UPDATE tracks SET cover = NULL, navidrome_cover = NULL, navidrome_user = NULL
    WHERE navidrome_user = ${userId}
    RETURNING id`;
  const cacheKeys = rows.flatMap((row) => coverCacheKeys(row.id as string));
  if (cacheKeys.length > 0) await sql`DELETE FROM cover_cache WHERE track_id = ANY(${cacheKeys})`;
}
