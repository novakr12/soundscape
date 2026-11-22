import { artistAlias } from "./aliases";
import { albumIdFor, artistIdFor, mainArtist, slug } from "./catalog";
import { isSongId } from "./navidrome";
import { sql } from "./postgres";

export type TrackAlbum = { album: string; albumHref?: string };

export async function knownAlbum(trackId: string): Promise<TrackAlbum | null> {
  const [row] = await sql`
    SELECT al.id, al.title FROM tracks t JOIN albums al ON al.id = t.album_id WHERE t.id = ${trackId}`;
  return row ? { album: row.title as string, albumHref: `/album/${encodeURIComponent(row.id as string)}` } : null;
}

export async function findKnownAlbum(artist: string, album: string): Promise<TrackAlbum | null> {
  const titleSlug = slug(album.replace(/\s+/g, " ").trim().slice(0, 300));
  if (!titleSlug) return null;
  const artistIds = [...new Set([artistIdFor(artist), artistIdFor(mainArtist(artist))].filter(Boolean))];
  const aliased = (await Promise.all(artistIds.map((id) => artistAlias(id)))).filter((id): id is string => Boolean(id));
  const candidates = [
    ...new Set(
      [
        albumIdFor(artist, album),
        ...aliased.map((id) => `${id}-${titleSlug}`),
        albumIdFor(mainArtist(artist), album),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  if (candidates.length === 0) return null;
  const rows = await sql`SELECT id, title FROM albums WHERE id = ANY(${candidates})`;
  const byId = new Map(rows.map((row) => [row.id as string, row.title as string]));
  for (const id of candidates) {
    const title = byId.get(id);
    if (title) return { album: title, albumHref: `/album/${encodeURIComponent(id)}` };
  }
  return null;
}

export function libraryAlbum(song: { album?: string; albumId?: string } | null | undefined): TrackAlbum | null {
  const album = song?.album?.trim();
  if (!album) return null;
  return song?.albumId && isSongId(song.albumId)
    ? { album, albumHref: `/music?album=${encodeURIComponent(song.albumId)}` }
    : { album };
}
