import { artistIdFor, slug, songTitle } from "./catalog";
import { sql } from "./postgres";

export type AlbumLink = { trackId: string; album: string; number?: number };
export type AlbumSource = "listen" | "deezer";

export type AlbumTrack = {
  trackId?: string;
  title: string;
  cover?: string;
  durationMs?: number;
  plays: number;
  yourPlays: number;
  number?: number;
  disc?: number;
};

export type Album = {
  albumId: string;
  title: string;
  artistId: string;
  artist: string;
  cover?: string;
  plays: number;
  yourPlays: number;
  listeners: number;
  played: number;
  tracks: AlbumTrack[];
};

export type AlbumSummary = { albumId: string; title: string; cover?: string; plays: number; tracks: number };

export function cleanAlbum(album: unknown) {
  return typeof album === "string" ? album.replace(/\s+/g, " ").trim().slice(0, 300) : "";
}

export function trackNumber(value: unknown) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return number >= 1 && number <= 999 ? number : undefined;
}

export function albumIdFor(artist: string, album: string) {
  const title = slug(cleanAlbum(album));
  return title ? `${artistIdFor(artist)}-${title}` : null;
}

export async function linkAlbums(links: AlbumLink[], source: AlbumSource = "listen"): Promise<number> {
  const firstAlbum = new Map<string, { trackId: string; slug: string; title: string; number: number | null }>();
  for (const link of links) {
    const title = cleanAlbum(link.album);
    if (!slug(title) || firstAlbum.has(link.trackId)) continue;
    firstAlbum.set(link.trackId, {
      trackId: link.trackId,
      slug: slug(title),
      title,
      number: trackNumber(link.number) ?? null,
    });
  }
  const albums = [...firstAlbum.values()];
  if (albums.length === 0) return 0;

  return sql.begin(async (transaction) => {
    await transaction`
      CREATE TEMPORARY TABLE album_links ON COMMIT DROP AS
      SELECT * FROM unnest(
        ${albums.map((album) => album.trackId)}::text[],
        ${albums.map((album) => album.slug)}::text[],
        ${albums.map((album) => album.title)}::text[],
        ${albums.map((album) => album.number)}::int[]
      ) AS link(track_id, slug, title, number)`;
    const targets = await transaction`
      SELECT t.id AS track_id, t.album_id AS previous, t.artist_id || '-' || l.slug AS album_id, t.artist_id, l.title, l.number
      FROM album_links l JOIN tracks t ON t.id = l.track_id
      WHERE t.album_id IS NULL
         OR (${source} = 'listen' AND t.album_source = 'deezer' AND t.album_id <> t.artist_id || '-' || l.slug)
      FOR UPDATE OF t`;
    if (targets.length > 0) {
      await transaction`
        INSERT INTO albums (id, title, artist_id)
        SELECT DISTINCT ON (album_id) album_id, title, artist_id
        FROM unnest(
          ${targets.map((target) => target.album_id)}::text[],
          ${targets.map((target) => target.title)}::text[],
          ${targets.map((target) => target.artist_id)}::text[]
        ) AS album(album_id, title, artist_id)
        ORDER BY album_id
        ON CONFLICT (id) DO NOTHING`;
      await transaction`
        UPDATE tracks SET album_id = target.album_id, album_source = ${source}, track_number = target.number
        FROM unnest(
          ${targets.map((target) => target.track_id)}::text[],
          ${targets.map((target) => target.album_id)}::text[],
          ${targets.map((target) => target.number)}::int[]
        ) AS target(track_id, album_id, number)
        WHERE tracks.id = target.track_id`;
      const replaced = targets.flatMap((target) => (target.previous ? [target.previous as string] : []));
      if (replaced.length > 0) {
        await transaction`
          DELETE FROM albums al
          WHERE al.id = ANY(${replaced}) AND NOT EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = al.id)`;
      }
    }
    await transaction`
      UPDATE tracks t SET track_number = l.number
      FROM album_links l
      WHERE t.id = l.track_id AND l.number IS NOT NULL AND t.track_number IS NULL
        AND t.album_id = t.artist_id || '-' || l.slug`;
    return targets.length;
  });
}

function orderTracks(
  played: AlbumTrack[],
  artistId: string,
  tracklist: { title: string; number: number; disc: number }[],
) {
  const byId = new Map(played.map((track) => [track.trackId!, track]));
  const ordered: AlbumTrack[] = tracklist.map((entry) => {
    const trackId = `${artistId}-${slug(songTitle(entry.title))}`;
    const track = byId.get(trackId);
    byId.delete(trackId);
    return track
      ? { ...track, number: entry.number, disc: entry.disc }
      : { title: entry.title, plays: 0, yourPlays: 0, number: entry.number, disc: entry.disc };
  });
  const rest = [...byId.values()].sort(
    (a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || b.plays - a.plays || a.title.localeCompare(b.title),
  );
  return [...ordered, ...(tracklist.length > 0 ? rest.map((track) => ({ ...track, number: undefined })) : rest)];
}

export async function getAlbum(albumId: string, viewer: string | null): Promise<Album | null> {
  const [album] = await sql`
    SELECT al.title, al.artist_id, a.name AS artist, al.tracklist,
           (SELECT count(DISTINCT p.user_id) FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
            WHERE t.album_id = al.id) AS listeners
    FROM albums al JOIN artists a ON a.id = al.artist_id
    WHERE al.id = ${albumId}`;
  if (!album) return null;
  const rows = await sql`
    SELECT t.id, t.title, t.cover, t.duration_ms, t.track_number,
           coalesce(sum(p.plays), 0) AS plays,
           coalesce(sum(p.plays) FILTER (WHERE p.user_id = ${viewer ?? ""}), 0) AS your_plays
    FROM tracks t LEFT JOIN user_track_plays p ON p.track_id = t.id
    WHERE t.album_id = ${albumId}
    GROUP BY t.id`;
  if (rows.length === 0) return null;
  const played: AlbumTrack[] = rows.map((row) => ({
    trackId: row.id,
    title: row.title,
    cover: row.cover ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    number: row.track_number ?? undefined,
    plays: row.plays,
    yourPlays: row.your_plays,
  }));
  const tracklist: { title: string; number: number; disc: number }[] = album.tracklist ?? [];
  return {
    albumId,
    title: album.title,
    artistId: album.artist_id,
    artist: album.artist,
    cover: played.find((t) => t.cover)?.cover,
    plays: played.reduce((sum, t) => sum + t.plays, 0),
    yourPlays: played.reduce((sum, t) => sum + t.yourPlays, 0),
    listeners: album.listeners,
    played: played.length,
    tracks: orderTracks(played, album.artist_id, tracklist),
  };
}

export async function albumOf(trackId: string): Promise<{ albumId: string; title: string } | null> {
  const [row] = await sql`
    SELECT al.id, al.title FROM tracks t JOIN albums al ON al.id = t.album_id WHERE t.id = ${trackId}`;
  return row ? { albumId: row.id, title: row.title } : null;
}

export async function albumsBy(artistId: string, limit = 24): Promise<AlbumSummary[]> {
  const rows = await sql`
    WITH songs AS (
      SELECT t.album_id, t.cover, coalesce(sum(p.plays), 0) AS plays
      FROM tracks t JOIN albums al ON al.id = t.album_id
      LEFT JOIN user_track_plays p ON p.track_id = t.id
      WHERE al.artist_id = ${artistId}
      GROUP BY t.id
    )
    SELECT al.id, al.title, sum(s.plays) AS plays, count(*) AS tracks,
           (array_agg(s.cover ORDER BY s.plays DESC) FILTER (WHERE s.cover IS NOT NULL))[1] AS cover
    FROM songs s JOIN albums al ON al.id = s.album_id
    GROUP BY al.id
    ORDER BY plays DESC, al.title
    LIMIT ${limit}`;
  return rows.map((row) => ({
    albumId: row.id,
    title: row.title,
    cover: row.cover ?? undefined,
    plays: Number(row.plays),
    tracks: row.tracks,
  }));
}

export type AlbumRef = { albumId: string; title: string };
export type TopAlbum = AlbumRef & { artist: string; cover?: string; plays: number };

export async function albumsFor(trackIds: string[]): Promise<Map<string, AlbumRef>> {
  const rows = await sql`
    SELECT t.id AS track_id, al.id, al.title
    FROM tracks t JOIN albums al ON al.id = t.album_id
    WHERE t.id = ANY(${[...new Set(trackIds)]})`;
  return new Map(
    rows.map((row) => [row.track_id as string, { albumId: row.id as string, title: row.title as string }]),
  );
}

export async function topAlbums(userId: string, limit = 5): Promise<TopAlbum[]> {
  const rows = await sql`
    SELECT al.id, al.title, a.name AS artist, sum(p.plays) AS plays,
           (array_agg(t.cover ORDER BY p.plays DESC) FILTER (WHERE t.cover IS NOT NULL))[1] AS cover
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
    JOIN albums al ON al.id = t.album_id JOIN artists a ON a.id = al.artist_id
    WHERE p.user_id = ${userId}
    GROUP BY al.id, a.id
    ORDER BY plays DESC, al.title
    LIMIT ${limit}`;
  return rows.map((row) => ({
    albumId: row.id,
    title: row.title,
    artist: row.artist,
    cover: row.cover ?? undefined,
    plays: row.plays,
  }));
}
