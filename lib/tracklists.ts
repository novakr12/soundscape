import { type AlbumTracklist, findDeezerAlbum } from "./deezer";
import { sql } from "./postgres";

const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;

export async function ensureTracklist(albumId: string, now = Date.now()) {
  const [row] = await sql`
    SELECT al.title, a.name AS artist, al.tracklist_checked_at
    FROM albums al JOIN artists a ON a.id = al.artist_id
    WHERE al.id = ${albumId}`;
  if (!row) return;
  if (row.tracklist_checked_at && now - row.tracklist_checked_at.getTime() < RECHECK_MS) return;

  let tracklist: AlbumTracklist | null;
  try {
    tracklist = await findDeezerAlbum(row.artist, row.title);
  } catch {
    return;
  }
  if (tracklist) {
    await sql`
      UPDATE albums SET tracklist_checked_at = ${new Date(now)}, deezer_album_id = ${tracklist.deezerAlbumId},
                        tracklist = ${sql.json(tracklist.tracks)}
      WHERE id = ${albumId}`;
  } else {
    await sql`UPDATE albums SET tracklist_checked_at = ${new Date(now)} WHERE id = ${albumId}`;
  }
}
