import { fillArtistPhotos } from "./artist-photos";
import { fillCoversFromCoverArtArchive } from "./coverartarchive";
import { matchMissingTracks, needsDeezer } from "./deezer";
import { getValue, keys, setValue } from "./kv";
import { fetchCoverArt, findLibrarySong, getNavidrome, NavidromeError, type SubsonicSong } from "./navidrome";
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

export async function fillCoversFromNavidrome(userId: string, limit = 50, now = Date.now()) {
  const server = await getNavidrome(userId);
  if (!server) return 0;

  const rows = await sql`
    SELECT t.id, t.title, a.name AS artist
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ${userId} AND t.cover IS NULL AND t.deezer_missing
      AND (t.navidrome_checked_at IS NULL OR t.navidrome_checked_at < ${new Date(now - RETRY_AFTER_MS)})
    ORDER BY t.id
    LIMIT ${limit}`;

  let found = 0;
  for (const row of rows) {
    const trackId: string = row.id;
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
  await fillCoversFromCoverArtArchive({ userId });
  await fillCoversFromNavidrome(userId);
  if (newTracks) await fillArtistPhotos({ userId, limit: 10 });
}

export async function getCover(trackId: string): Promise<Cover | null> {
  const [cached] = await sql`SELECT type, data FROM cover_cache WHERE track_id = ${trackId} AND expires_at > now()`;
  if (cached) return { type: cached.type, data: cached.data };

  const [row] = await sql`SELECT navidrome_cover, navidrome_user FROM tracks WHERE id = ${trackId}`;
  const coverArt: string | null = row?.navidrome_cover ?? null;
  const userId: string | null = row?.navidrome_user ?? null;
  if (!coverArt || !userId) return null;

  const server = await getNavidrome(userId);
  if (!server) return null;
  let cover: Cover;
  try {
    cover = await fetchCoverArt(server, coverArt);
  } catch (error) {
    if (error instanceof NavidromeError) return null;
    throw error;
  }
  await sql`
    INSERT INTO cover_cache (track_id, type, data, expires_at)
    VALUES (${trackId}, ${cover.type}, ${cover.data}, ${new Date(Date.now() + CACHE_SECONDS * 1000)})
    ON CONFLICT (track_id) DO UPDATE SET type = excluded.type, data = excluded.data, expires_at = excluded.expires_at`;
  return cover;
}

export async function forgetNavidromeCovers(userId: string) {
  const rows = await sql`
    UPDATE tracks SET cover = NULL, navidrome_cover = NULL, navidrome_user = NULL
    WHERE navidrome_user = ${userId}
    RETURNING id`;
  const trackIds = rows.map((row) => row.id as string);
  if (trackIds.length > 0) await sql`DELETE FROM cover_cache WHERE track_id = ANY(${trackIds})`;
}
