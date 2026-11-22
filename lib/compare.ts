import { sql } from "./postgres";
import { startOfDay } from "./time";
import { getYearscape, type Yearscape } from "./yearscape";

const SHARED_SHOWN = 10;
const ONLY_SHOWN = 5;

export type ComparedArtist = { artistId: string; name: string; photo?: string; mine: number; theirs: number };
export type ComparedSong = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  mine: number;
  theirs: number;
};

export type YearComparison = {
  year: number;
  years: number[];
  mine: Yearscape;
  theirs: Yearscape;
  score: number | null;
  sharedArtistCount: number;
  sharedArtists: ComparedArtist[];
  onlyMine: ComparedArtist[];
  onlyTheirs: ComparedArtist[];
  sharedSongs: ComparedSong[];
};

type RawArtistRow = { artistId: string; name: string; photo: string | null; mine: number; theirs: number };

function cleanArtist({ artistId, name, photo, mine, theirs }: RawArtistRow): ComparedArtist {
  return { artistId, name, ...(photo ? { photo } : {}), mine, theirs };
}

export async function compareYears(userId: string, otherId: string, year: number, now = new Date()) {
  const from = startOfDay(`${year}-01-01`);
  const to = startOfDay(`${year + 1}-01-01`);
  const [mine, theirs, [summary]] = await Promise.all([
    getYearscape(userId, year, now),
    getYearscape(otherId, year, now),
    sql`
      WITH per_artist AS (
        SELECT a.id, a.name, a.photo,
               count(*) FILTER (WHERE p.user_id = ${userId})::int AS mine,
               count(*) FILTER (WHERE p.user_id = ${otherId})::int AS theirs
        FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
        WHERE p.user_id IN (${userId}, ${otherId}) AND p.played_at >= ${from} AND p.played_at < ${to}
        GROUP BY a.id, a.name, a.photo
      ),
      totals AS (
        SELECT coalesce(sum(mine), 0)::float8 AS my_total,
               coalesce(sum(theirs), 0)::float8 AS their_total,
               coalesce(sum(sqrt(mine::float8 * theirs::float8)) FILTER (WHERE mine > 0 AND theirs > 0), 0)::float8 AS dot,
               count(*) FILTER (WHERE mine > 0 AND theirs > 0)::int AS shared_count
        FROM per_artist
      ),
      top_shared AS (
        SELECT json_agg(row ORDER BY row.weight DESC, row.total DESC) AS items
        FROM (
          SELECT p.id AS "artistId", p.name, p.photo, p.mine, p.theirs,
                 least(p.mine::float8 / nullif(t.my_total, 0), p.theirs::float8 / nullif(t.their_total, 0)) AS weight,
                 p.mine + p.theirs AS total
          FROM per_artist p CROSS JOIN totals t
          WHERE p.mine > 0 AND p.theirs > 0
          ORDER BY weight DESC, total DESC
          LIMIT ${SHARED_SHOWN}
        ) row
      ),
      top_mine AS (
        SELECT json_agg(row ORDER BY row.mine DESC, row.name ASC) AS items
        FROM (
          SELECT id AS "artistId", name, photo, mine, theirs
          FROM per_artist
          WHERE mine > 0 AND theirs = 0
          ORDER BY mine DESC, name ASC
          LIMIT ${ONLY_SHOWN}
        ) row
      ),
      top_theirs AS (
        SELECT json_agg(row ORDER BY row.theirs DESC, row.name ASC) AS items
        FROM (
          SELECT id AS "artistId", name, photo, mine, theirs
          FROM per_artist
          WHERE theirs > 0 AND mine = 0
          ORDER BY theirs DESC, name ASC
          LIMIT ${ONLY_SHOWN}
        ) row
      )
      SELECT t.my_total, t.their_total, t.dot, t.shared_count,
             coalesce(ts.items, '[]'::json) AS shared_artists,
             coalesce(tm.items, '[]'::json) AS only_mine,
             coalesce(tt.items, '[]'::json) AS only_theirs
      FROM totals t, top_shared ts, top_mine tm, top_theirs tt`,
  ]);

  const songRows =
    mine.plays > 0 && theirs.plays > 0
      ? await sql`
          SELECT t.id, t.title, a.name AS artist, t.cover,
                 count(*) FILTER (WHERE p.user_id = ${userId})::int AS mine,
                 count(*) FILTER (WHERE p.user_id = ${otherId})::int AS theirs
          FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
          WHERE p.user_id IN (${userId}, ${otherId}) AND p.played_at >= ${from} AND p.played_at < ${to}
          GROUP BY t.id, a.id
          HAVING count(*) FILTER (WHERE p.user_id = ${userId}) > 0 AND count(*) FILTER (WHERE p.user_id = ${otherId}) > 0
          ORDER BY least(
            (count(*) FILTER (WHERE p.user_id = ${userId}))::float8 / ${mine.plays},
            (count(*) FILTER (WHERE p.user_id = ${otherId}))::float8 / ${theirs.plays}
          ) DESC, (count(*) FILTER (WHERE p.user_id = ${userId}) + count(*) FILTER (WHERE p.user_id = ${otherId})) DESC
          LIMIT ${SHARED_SHOWN}`
      : [];

  const score =
    summary.my_total > 0 && summary.their_total > 0
      ? Math.round((100 * summary.dot) / Math.sqrt(summary.my_total * summary.their_total))
      : null;

  const comparison: YearComparison = {
    year,
    years: [...new Set([...mine.years, ...theirs.years])].sort((a, b) => b - a),
    mine,
    theirs,
    score,
    sharedArtistCount: summary.shared_count,
    sharedArtists: (summary.shared_artists as RawArtistRow[]).map(cleanArtist),
    onlyMine: (summary.only_mine as RawArtistRow[]).map(cleanArtist),
    onlyTheirs: (summary.only_theirs as RawArtistRow[]).map(cleanArtist),
    sharedSongs: songRows.map((row) => ({
      trackId: row.id as string,
      title: row.title as string,
      artist: row.artist as string,
      ...(row.cover ? { cover: row.cover as string } : {}),
      mine: row.mine as number,
      theirs: row.theirs as number,
    })),
  };
  return comparison;
}
