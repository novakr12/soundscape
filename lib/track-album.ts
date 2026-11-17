import { isSongId } from "./navidrome";
import { sql } from "./postgres";

export type TrackAlbum = { album: string; albumHref?: string };

export async function knownAlbum(trackId: string): Promise<TrackAlbum | null> {
  const [row] = await sql`
    SELECT al.id, al.title FROM tracks t JOIN albums al ON al.id = t.album_id WHERE t.id = ${trackId}`;
  return row ? { album: row.title as string, albumHref: `/album/${encodeURIComponent(row.id as string)}` } : null;
}

export function libraryAlbum(song: { album?: string; albumId?: string } | null | undefined): TrackAlbum | null {
  const album = song?.album?.trim();
  if (!album) return null;
  return song?.albumId && isSongId(song.albumId)
    ? { album, albumHref: `/music?album=${encodeURIComponent(song.albumId)}` }
    : { album };
}
