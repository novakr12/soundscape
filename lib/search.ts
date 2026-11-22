import type { Sql } from "postgres";
import { sql } from "./postgres";

import { MIN_QUERY_LENGTH } from "./search-limits";

export { MIN_QUERY_LENGTH };
export const FUZZY_FROM = 4;
const FUZZY_CUTOFF = "0.5";

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
  const whole = text.trim().replace(/\s+/g, " ").slice(0, 100);
  return {
    exact: terms.join(" | "),
    prefix: terms.map((term) => `${term}:*`).join(" | "),
    fuzzy: whole.length >= FUZZY_FROM ? whole : null,
  };
}

type Terms = NonNullable<ReturnType<typeof searchTerms>>;

export function fuzzyQuery(text: string) {
  return searchTerms(text)?.fuzzy ?? null;
}

function rank(db: Sql, column: string, terms: Terms) {
  const similar = terms.fuzzy
    ? db`word_similarity(fuzzy_text(${terms.fuzzy}), fuzzy_text(${db.unsafe(column)}))`
    : db`0`;
  return db`(2 * ts_rank(search_vector(${db.unsafe(column)}), search_query(${terms.exact}))
              + ts_rank(search_vector(${db.unsafe(column)}), search_query(${terms.prefix}))
              + ${similar})`;
}

function matches(db: Sql, column: string, terms: Terms) {
  const words = db`search_vector(${db.unsafe(column)}) @@ search_query(${terms.prefix})`;
  if (!terms.fuzzy) return words;
  return db`(${words} OR fuzzy_text(${terms.fuzzy}) <% fuzzy_text(${db.unsafe(column)}))`;
}

async function searching<T>(terms: Terms, run: (db: Sql) => Promise<T>): Promise<T> {
  if (!terms.fuzzy) return run(sql);
  return (await sql.begin(async (db) => {
    await db`SELECT set_config('pg_trgm.word_similarity_threshold', ${FUZZY_CUTOFF}, true)`;
    return run(db as unknown as Sql);
  })) as T;
}

export async function searchArtists(text: string, limit = 6): Promise<ArtistResult[]> {
  const terms = searchTerms(text);
  if (!terms) return [];
  const rows = await searching(
    terms,
    (db) => db`
    WITH hits AS (
      SELECT a.id, a.name, a.photo, ${rank(db, "a.name", terms)} AS score
      FROM artists a
      WHERE ${matches(db, "a.name", terms)}
    )
    SELECT h.id, h.name, h.photo, h.score, coalesce(sum(p.plays), 0) AS plays, count(DISTINCT p.user_id) AS listeners,
           (array_agg(t.cover ORDER BY p.plays DESC NULLS LAST, t.id) FILTER (WHERE t.cover IS NOT NULL))[1] AS cover
    FROM hits h
    LEFT JOIN tracks t ON t.artist_id = h.id
    LEFT JOIN user_track_plays p ON p.track_id = t.id
    GROUP BY h.id, h.name, h.photo, h.score
    ORDER BY h.score DESC, plays DESC, h.name
    LIMIT ${limit}`,
  );
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
  const rows = await searching(
    terms,
    (db) => db`
    WITH hits AS (
      SELECT al.id, al.title, al.artist_id, ${rank(db, "al.title", terms)} AS score
      FROM albums al
      WHERE ${matches(db, "al.title", terms)}
    )
    SELECT h.id, h.title, a.name AS artist, h.score, coalesce(sum(p.plays), 0) AS plays,
           (array_agg(t.cover ORDER BY t.id) FILTER (WHERE t.cover IS NOT NULL))[1] AS cover
    FROM hits h JOIN artists a ON a.id = h.artist_id
    LEFT JOIN tracks t ON t.album_id = h.id
    LEFT JOIN user_track_plays p ON p.track_id = t.id
    GROUP BY h.id, h.title, h.score, a.id
    ORDER BY h.score DESC, plays DESC, h.title
    LIMIT ${limit}`,
  );
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
  const rows = await searching(
    terms,
    (db) => db`
    WITH hits AS (
      SELECT t.id, t.title, t.cover, t.artist_id, ${rank(db, "t.title", terms)} AS score
      FROM tracks t
      WHERE ${matches(db, "t.title", terms)}
    ), artist_hits AS (
      SELECT a.id, a.name,
             CASE WHEN ${matches(db, "a.name", terms)} THEN ${rank(db, "a.name", terms)} ELSE 0 END AS score
      FROM artists a
      WHERE a.id IN (SELECT artist_id FROM hits)
    )
    SELECT h.id, h.title, ah.name AS artist, h.cover, h.score + ah.score AS score, coalesce(sum(p.plays), 0) AS plays
    FROM hits h JOIN artist_hits ah ON ah.id = h.artist_id
    LEFT JOIN user_track_plays p ON p.track_id = h.id
    GROUP BY h.id, h.title, h.cover, h.score, ah.name, ah.score
    ORDER BY score DESC, plays DESC, h.title
    LIMIT ${limit}`,
  );
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
  const rows = await sql`
    SELECT username
    FROM users
    WHERE strpos(username, ${needle}) > 0
      AND (NOT is_private OR username = ${viewer})
    ORDER BY starts_with(username, ${needle}) DESC, username ASC
    LIMIT ${limit}`;
  return rows.map((row) => row.username as string);
}
