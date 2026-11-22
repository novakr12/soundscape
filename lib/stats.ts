import { shiftMonth } from "./history";
import { sql } from "./postgres";
import { addDays, localDay, monthBucket, monthRange, startOfDay, TIME_ZONE } from "./time";

export type DailyPlays = { day: string; plays: number };
export type RankedItem = { name: string; plays: number };
export type Totals = { plays: number; tracks: number; artists: number };
export type GenreStats = { genres: RankedItem[]; coverage: number };
export type ListeningTime = { ms: number; knownShare: number };

const DEFAULT_SONG_MS = 210_000;

export async function getPlaysPerDay(userId: string, days = 30, now = new Date()): Promise<DailyPlays[]> {
  if (days <= 0) return [];
  const dayList = Array.from({ length: days }, (_, i) => addDays(localDay(now), i - days + 1));
  const rows = await sql`
    SELECT to_char((played_at AT TIME ZONE ${TIME_ZONE})::date, 'YYYY-MM-DD') AS day,
           count(*)::int AS plays
    FROM plays
    WHERE user_id = ${userId}
      AND played_at >= ${startOfDay(dayList[0])}
      AND played_at < ${startOfDay(addDays(dayList[dayList.length - 1], 1))}
    GROUP BY 1`;
  const counts = new Map(dayList.map((day) => [day, 0]));
  for (const row of rows) {
    if (counts.has(row.day)) counts.set(row.day, row.plays);
  }
  return dayList.map((day) => ({ day, plays: counts.get(day)! }));
}

export async function getListeningTime(
  userId: string,
  days = 30,
  now = new Date(),
): Promise<{ recent: ListeningTime; allTime: ListeningTime }> {
  const [allTime] = await sql`
    SELECT coalesce(sum(p.plays), 0) AS plays,
           coalesce(sum(p.plays) FILTER (WHERE t.duration_ms IS NOT NULL), 0) AS known_plays,
           coalesce(sum(p.plays::bigint * t.duration_ms), 0)::float8 AS known_ms
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
    WHERE p.user_id = ${userId}`;
  const [recent] = await sql`
    SELECT count(*) AS plays, count(t.duration_ms) AS known_plays, coalesce(sum(t.duration_ms), 0) AS known_ms
    FROM plays p JOIN tracks t ON t.id = p.track_id
    WHERE p.user_id = ${userId} AND p.played_at >= ${startOfDay(addDays(localDay(now), 1 - days))}`;

  const average = allTime.known_plays > 0 ? allTime.known_ms / allTime.known_plays : DEFAULT_SONG_MS;
  const estimate = (known: number, all: number, ms: number) => ({
    ms: ms + (all - known) * average,
    knownShare: all > 0 ? known / all : 1,
  });
  return {
    recent: estimate(recent.known_plays, recent.plays, recent.known_ms),
    allTime: estimate(allTime.known_plays, allTime.plays, allTime.known_ms),
  };
}

export async function getListeningHeatmap(userId: string, months = 12, now = new Date()): Promise<number[][]> {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const { from } = monthRange(shiftMonth(monthBucket(now), 1 - months));
  const rows = await sql`
    SELECT extract(isodow FROM played_at AT TIME ZONE ${TIME_ZONE})::int - 1 AS weekday,
           extract(hour FROM played_at AT TIME ZONE ${TIME_ZONE})::int AS hour,
           count(*)::int AS plays
    FROM plays
    WHERE user_id = ${userId} AND played_at >= ${from}
    GROUP BY 1, 2`;
  for (const row of rows) grid[row.weekday][row.hour] = row.plays;
  return grid;
}

export async function getTotals(userId: string): Promise<Totals> {
  const [row] = await sql`
    SELECT coalesce(sum(p.plays), 0) AS plays, count(*) AS tracks, count(DISTINCT t.artist_id) AS artists
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
    WHERE p.user_id = ${userId}`;
  return { plays: row.plays, tracks: row.tracks, artists: row.artists };
}

export async function getTopArtists(userId: string, limit = 10): Promise<RankedItem[]> {
  const rows = await sql`
    SELECT a.name, sum(p.plays) AS plays
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ${userId}
    GROUP BY a.id
    ORDER BY plays DESC, a.name
    LIMIT ${limit}`;
  return rows.map((row) => ({ name: row.name, plays: row.plays }));
}

export async function getTopGenres(userId: string, limit = 8): Promise<GenreStats> {
  const [genres, [coverage]] = await Promise.all([
    sql`
      SELECT g.genre AS name, sum(p.plays) AS plays
      FROM user_track_plays p JOIN tracks t ON t.id = p.track_id JOIN artist_genres g ON g.artist_id = t.artist_id
      WHERE p.user_id = ${userId}
      GROUP BY g.genre
      ORDER BY plays DESC, g.genre
      LIMIT ${limit}`,
    sql`
      SELECT coalesce(sum(p.plays), 0) AS total,
             coalesce(sum(p.plays) FILTER (WHERE EXISTS (SELECT 1 FROM artist_genres g WHERE g.artist_id = t.artist_id)), 0)
               AS with_genre
      FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
      WHERE p.user_id = ${userId}`,
  ]);
  return {
    genres: genres.map((row) => ({ name: row.name, plays: row.plays })),
    coverage: coverage.total === 0 ? 0 : coverage.with_genre / coverage.total,
  };
}
