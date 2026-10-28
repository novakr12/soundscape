import type { LibrarySong } from "./navidrome";
import { sql } from "./postgres";

export type WantedSong = LibrarySong & { addedAt: Date };

export async function getWanted(userId: string): Promise<WantedSong[]> {
  const rows = await sql`
    SELECT track_id, title, artist, added_at FROM wanted WHERE user_id = ${userId} ORDER BY added_at DESC, track_id`;
  return rows.map((row) => ({ trackId: row.track_id, title: row.title, artist: row.artist, addedAt: row.added_at }));
}

export async function addWanted(userId: string, trackId: string): Promise<boolean> {
  const added = await sql`
    INSERT INTO wanted (user_id, track_id, title, artist)
    SELECT ${userId}, t.id, t.title, a.name FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE t.id = ${trackId}
    ON CONFLICT (user_id, track_id) DO UPDATE SET title = excluded.title, artist = excluded.artist, added_at = now()
    RETURNING track_id`;
  return added.length > 0;
}

export async function removeWanted(userId: string, trackIds: string[]) {
  if (trackIds.length === 0) return;
  await sql`DELETE FROM wanted WHERE user_id = ${userId} AND track_id = ANY(${trackIds})`;
}
