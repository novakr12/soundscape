import { type ArtistPhoto, findDeezerArtist } from "./deezer";
import { sql } from "./postgres";

const RETRY_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const FILL_EVERY_MS = 60 * 60 * 1000;
const FILL_PER_RUN = 100;

export type PhotoSummary = { checked: number; found: number; unreachable: boolean };

export async function fillArtistPhotos({
  limit = 50,
  userId,
  now = Date.now(),
}: {
  limit?: number;
  userId?: string;
  now?: number;
} = {}) {
  const rows = await sql`
    SELECT a.id, a.name, sum(p.plays) AS plays
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE (a.photo_checked_at IS NULL OR (a.photo IS NULL AND a.photo_checked_at < ${new Date(now - RETRY_AFTER_MS)}))
      ${userId ? sql`AND p.user_id = ${userId}` : sql``}
    GROUP BY a.id
    ORDER BY plays DESC, a.id
    LIMIT ${limit}`;

  const summary: PhotoSummary = { checked: 0, found: 0, unreachable: false };
  for (const row of rows) {
    let match: ArtistPhoto | null;
    try {
      match = await findDeezerArtist(row.name);
    } catch {
      summary.unreachable = true;
      break;
    }
    summary.checked++;
    if (match?.photo) summary.found++;
    await sql`
      UPDATE artists SET photo = ${match?.photo ?? null}, deezer_artist_id = ${match?.deezerArtistId ?? null},
                         photo_checked_at = ${new Date(now)}
      WHERE id = ${row.id}`;
  }
  return summary;
}

const globalForPhotos = globalThis as unknown as { photoFilling?: boolean };

export function startArtistPhotoFilling() {
  if (globalForPhotos.photoFilling) return;
  globalForPhotos.photoFilling = true;
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await fillArtistPhotos({ limit: FILL_PER_RUN });
    } catch (error) {
      console.warn(`Artist photos: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  }, FILL_EVERY_MS);
}
