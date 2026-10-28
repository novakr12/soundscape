import { sql } from "./postgres";
import { privateUsers } from "./privacy";

export const MIN_QUERY_LENGTH = 2;

export type SongResult = { trackId: string; title: string; artist: string; cover?: string; plays: number };
export type AlbumResult = { albumId: string; title: string; artist: string; cover?: string; plays: number };
export type ArtistResult = {
  artistId: string;
  name: string;
  cover?: string;
  photo: boolean;
  plays: number;
  listeners: number;
};

function searchTerms(text: string) {
  const terms = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  if (terms.length === 0) return null;
  return { exact: terms.join(" | "), prefix: terms.map((term) => `${term}:*`).join(" | ") };
}

function rank(column: string, terms: { exact: string; prefix: string }) {
  return sql`(2 * ts_rank(search_vector(${sql.unsafe(column)}), search_query(${terms.exact}))
              + ts_rank(search_vector(${sql.unsafe(column)}), search_query(${terms.prefix})))`;
}

export async function searchArtists(text: string, limit = 6): Promise<ArtistResult[]> {
  const terms = searchTerms(text);
  if (!terms) return [];
  const rows = await sql`
    WITH hits AS (
      SELECT a.id, a.name, a.photo, ${rank("a.name", terms)} AS score
      FROM artists a
      WHERE search_vector(a.name) @@ search_query(${terms.prefix})
    )
    SELECT h.id, h.name, h.photo, h.score, coalesce(sum(p.plays), 0) AS plays, count(DISTINCT p.user_id) AS listeners,
           (array_agg(t.cover ORDER BY p.plays DESC NULLS LAST, t.id) FILTER (WHERE t.cover IS NOT NULL))[1] AS cover
    FROM hits h
    LEFT JOIN tracks t ON t.artist_id = h.id
    LEFT JOIN user_track_plays p ON p.track_id = t.id
    GROUP BY h.id, h.name, h.photo, h.score
    ORDER BY h.score DESC, plays DESC, h.name
    LIMIT ${limit}`;
  return rows.map((row) => ({
    artistId: row.id,
    name: row.name,
    cover: row.photo ?? row.cover ?? undefined,
    photo: Boolean(row.photo),
    plays: row.plays,
    listeners: row.listeners,
  }));
}

export async function searchAlbums(text: string, limit = 6): Promise<AlbumResult[]> {
  const terms = searchTerms(text);
  if (!terms) return [];
  const rows = await sql`
    WITH hits AS (
      SELECT al.id, al.title, al.artist_id, ${rank("al.title", terms)} AS score
      FROM albums al
      WHERE search_vector(al.title) @@ search_query(${terms.prefix})
    )
    SELECT h.id, h.title, a.name AS artist, h.score, coalesce(sum(p.plays), 0) AS plays,
           (array_agg(t.cover ORDER BY t.id) FILTER (WHERE t.cover IS NOT NULL))[1] AS cover
    FROM hits h JOIN artists a ON a.id = h.artist_id
    LEFT JOIN tracks t ON t.album_id = h.id
    LEFT JOIN user_track_plays p ON p.track_id = t.id
    GROUP BY h.id, h.title, h.score, a.id
    ORDER BY h.score DESC, plays DESC, h.title
    LIMIT ${limit}`;
  return rows.map((row) => ({
    albumId: row.id,
    title: row.title,
    artist: row.artist,
    cover: row.cover ?? undefined,
    plays: row.plays,
  }));
}

export async function searchSongs(text: string, limit = 8): Promise<SongResult[]> {
  const terms = searchTerms(text);
  if (!terms) return [];
  const rows = await sql`
    WITH hits AS (
      SELECT t.id, t.title, t.cover, t.artist_id, ${rank("t.title", terms)} AS score
      FROM tracks t
      WHERE search_vector(t.title) @@ search_query(${terms.prefix})
    ), artist_hits AS (
      SELECT a.id, a.name,
             CASE WHEN search_vector(a.name) @@ search_query(${terms.prefix}) THEN ${rank("a.name", terms)} ELSE 0 END AS score
      FROM artists a
      WHERE a.id IN (SELECT artist_id FROM hits)
    )
    SELECT h.id, h.title, ah.name AS artist, h.cover, h.score + ah.score AS score, coalesce(sum(p.plays), 0) AS plays
    FROM hits h JOIN artist_hits ah ON ah.id = h.artist_id
    LEFT JOIN user_track_plays p ON p.track_id = h.id
    GROUP BY h.id, h.title, h.cover, h.score, ah.name, ah.score
    ORDER BY score DESC, plays DESC, h.title
    LIMIT ${limit}`;
  return rows.map((row) => ({
    trackId: row.id,
    title: row.title,
    artist: row.artist,
    cover: row.cover ?? undefined,
    plays: row.plays,
  }));
}

export async function searchUsers(text: string, viewer: string | null, limit = 8): Promise<string[]> {
  const needle = text.toLowerCase().replace(/\s+/g, "");
  if (needle.length < MIN_QUERY_LENGTH) return [];
  const rows = await sql`SELECT username FROM users WHERE strpos(username, ${needle}) > 0`;
  const matches = rows.map((row) => row.username as string);
  const hidden = await privateUsers(matches);
  return matches
    .filter((username) => !hidden.has(username) || username === viewer)
    .sort((a, b) => Number(b.startsWith(needle)) - Number(a.startsWith(needle)) || a.localeCompare(b))
    .slice(0, limit);
}
