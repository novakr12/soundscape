import { artistAlias } from "./aliases";
import { albumIdFor, artistIdFor, mainArtist, slug } from "./catalog";
import { isSongId } from "./navidrome";
import { sql } from "./postgres";

export type TrackAlbum = { album: string; albumHref?: string };
export type KnownTrackInfo = { album?: TrackAlbum; cover?: string; navidromeCover?: string };

export async function knownAlbum(trackId: string): Promise<TrackAlbum | null> {
  const [row] = await sql`
    SELECT al.id, al.title FROM tracks t JOIN albums al ON al.id = t.album_id WHERE t.id = ${trackId}`;
  return row ? { album: row.title as string, albumHref: `/album/${encodeURIComponent(row.id as string)}` } : null;
}

function safeCoverUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    (trimmed.startsWith("/") && !trimmed.startsWith("//"))
    ? trimmed
    : undefined;
}

export function resolveTrackCover(input: {
  cover?: string | null;
  navidromeCover?: string | null;
  coverArt?: string | null;
}): string | undefined {
  const direct = safeCoverUrl(input.cover);
  if (direct) return direct;
  for (const candidate of [input.navidromeCover, input.coverArt]) {
    const art = candidate?.trim();
    if (art && isSongId(art)) return `/api/navidrome/cover/${encodeURIComponent(art)}`;
  }
  return undefined;
}

export async function knownTrackInfo(trackId: string): Promise<KnownTrackInfo> {
  const [row] = await sql`
    SELECT t.cover, t.navidrome_cover, al.id AS album_id, al.title AS album_title
    FROM tracks t
    LEFT JOIN albums al ON al.id = t.album_id
    WHERE t.id = ${trackId}`;
  if (!row) return {};
  const album =
    row.album_id && row.album_title
      ? { album: row.album_title as string, albumHref: `/album/${encodeURIComponent(row.album_id as string)}` }
      : undefined;
  const cover = typeof row.cover === "string" && row.cover.trim() ? row.cover.trim() : undefined;
  const navidromeCover =
    typeof row.navidrome_cover === "string" && row.navidrome_cover.trim() ? row.navidrome_cover.trim() : undefined;
  return {
    ...(album ? { album } : {}),
    ...(cover ? { cover } : {}),
    ...(navidromeCover ? { navidromeCover } : {}),
  };
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
