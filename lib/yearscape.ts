import type { TopAlbum } from "./albums";
import { shiftMonth } from "./history";
import { getValue, keys, setValue } from "./kv";
import { userMonths as playMonths } from "./months";
import { sql } from "./postgres";
import { addDays, localDay, startOfDay, TIME_ZONE } from "./time";

const DEFAULT_SONG_MS = 210_000;
const CACHE_SECONDS = 24 * 60 * 60;
const TOP = 5;

export type YearSong = { trackId: string; title: string; artist: string; cover?: string; plays: number };
export type YearArtist = { name: string; plays: number; cover?: string; photo?: boolean };
export type YearMonth = { month: string; plays: number; topSong?: YearSong; topArtist?: YearArtist };

type Summary = {
  plays: number;
  listeningMs: number;
  artists: number;
  songs: number;
  topSongs: YearSong[];
  topArtists: YearArtist[];
  topGenres: { name: string; plays: number }[];
  topAlbums: TopAlbum[];
  busiestDay?: { day: string; plays: number };
  longestStreak?: { days: number; from: string; to: string };
  newArtists: { name: string; month: string }[];
};

export type Yearscape = Summary & { year: number; years: number[]; months: YearMonth[] };

export type Monthscape = Summary & {
  month: string;
  previous?: string;
  next?: string;
  days: { day: string; plays: number }[];
};

function longestStreak(days: string[]) {
  let best: Summary["longestStreak"];
  let start = days[0];
  for (let i = 0; i < days.length; i++) {
    if (i > 0 && addDays(days[i - 1], 1) !== days[i]) start = days[i];
    const length = (new Date(days[i]).getTime() - new Date(start).getTime()) / 86_400_000 + 1;
    if (!best || length > best.days) best = { days: length, from: start, to: days[i] };
  }
  return best;
}

async function summarizeRange(
  userId: string,
  from: Date,
  to: Date,
): Promise<{ summary: Summary; dayPlays: Map<string, number> }> {
  const [totals] = await sql`
    SELECT count(*)::int AS plays,
           count(DISTINCT p.track_id)::int AS songs,
           count(DISTINCT t.artist_id)::int AS artists,
           count(t.duration_ms)::int AS known_plays,
           coalesce(sum(t.duration_ms), 0)::float8 AS known_ms
    FROM plays p JOIN tracks t ON t.id = p.track_id
    WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to}`;

  if (!totals || totals.plays === 0) {
    return {
      summary: {
        plays: 0,
        listeningMs: 0,
        artists: 0,
        songs: 0,
        topSongs: [],
        topArtists: [],
        topGenres: [],
        topAlbums: [],
        busiestDay: undefined,
        longestStreak: undefined,
        newArtists: [],
      },
      dayPlays: new Map(),
    };
  }

  const [songRows, artistRows, genreRows, albumRows, dayRows, newArtistRows] = await Promise.all([
    sql`
      SELECT p.track_id, t.title, a.name AS artist, t.cover, count(*)::int AS plays
      FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
      WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to}
      GROUP BY p.track_id, t.title, a.name, t.cover
      ORDER BY plays DESC, min(p.played_at) ASC
      LIMIT ${TOP}`,
    sql`
      WITH artist_plays AS (
        SELECT a.id, a.name, a.photo, count(*)::int AS plays, min(p.played_at) AS first_at
        FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
        WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to}
        GROUP BY a.id, a.name, a.photo
        ORDER BY plays DESC, first_at ASC
        LIMIT ${TOP}
      )
      SELECT ap.name, ap.photo, ap.plays,
             CASE WHEN ap.photo IS NULL THEN (
               SELECT t2.cover
               FROM plays p2 JOIN tracks t2 ON t2.id = p2.track_id
               WHERE p2.user_id = ${userId} AND p2.played_at >= ${from} AND p2.played_at < ${to}
                 AND t2.artist_id = ap.id AND t2.cover IS NOT NULL
               GROUP BY t2.id, t2.cover
               ORDER BY count(*) DESC, min(p2.played_at) ASC
               LIMIT 1
             ) END AS song_cover
      FROM artist_plays ap
      ORDER BY ap.plays DESC, ap.first_at ASC`,
    sql`
      SELECT g.genre AS name, count(*)::int AS plays
      FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artist_genres g ON g.artist_id = t.artist_id
      WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to}
      GROUP BY g.genre
      ORDER BY plays DESC, g.genre ASC
      LIMIT ${TOP}`,
    sql`
      WITH track_plays AS (
        SELECT p.track_id, t.album_id, t.cover, a.name AS artist, count(*)::int AS plays, min(p.played_at) AS first_at
        FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
        WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to} AND t.album_id IS NOT NULL
        GROUP BY p.track_id, t.album_id, t.cover, a.name
      )
      SELECT al.id AS album_id,
             al.title,
             (array_agg(tp.artist ORDER BY tp.plays DESC, tp.first_at ASC))[1] AS artist,
             (array_agg(tp.cover ORDER BY tp.plays DESC, tp.first_at ASC) FILTER (WHERE tp.cover IS NOT NULL))[1] AS cover,
             sum(tp.plays)::int AS plays
      FROM track_plays tp JOIN albums al ON al.id = tp.album_id
      GROUP BY al.id, al.title
      ORDER BY plays DESC, al.title ASC
      LIMIT ${TOP}`,
    sql`
      SELECT to_char((played_at AT TIME ZONE ${TIME_ZONE})::date, 'YYYY-MM-DD') AS day,
             count(*)::int AS plays
      FROM plays
      WHERE user_id = ${userId} AND played_at >= ${from} AND played_at < ${to}
      GROUP BY 1
      ORDER BY 1 ASC`,
    sql`
      SELECT a.name,
             to_char((min(p.played_at) AT TIME ZONE ${TIME_ZONE})::date, 'YYYY-MM') AS month
      FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
      WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to}
        AND NOT EXISTS (
          SELECT 1
          FROM plays p0 JOIN tracks t0 ON t0.id = p0.track_id
          WHERE p0.user_id = ${userId} AND t0.artist_id = t.artist_id AND p0.played_at < ${from}
        )
      GROUP BY a.id, a.name
      ORDER BY min(p.played_at) ASC`,
  ]);

  const average = totals.known_plays > 0 ? totals.known_ms / totals.known_plays : DEFAULT_SONG_MS;
  const dayPlays = new Map<string, number>();
  let busiestDay: Summary["busiestDay"];
  for (const row of dayRows) {
    dayPlays.set(row.day, row.plays);
    if (!busiestDay || row.plays > busiestDay.plays) busiestDay = { day: row.day, plays: row.plays };
  }

  return {
    summary: {
      plays: totals.plays,
      listeningMs: totals.known_ms + (totals.plays - totals.known_plays) * average,
      artists: totals.artists,
      songs: totals.songs,
      topSongs: songRows.map((row) => ({
        trackId: row.track_id,
        title: row.title,
        artist: row.artist,
        cover: row.cover ?? undefined,
        plays: row.plays,
      })),
      topArtists: artistRows.map((row) =>
        row.photo
          ? { name: row.name, plays: row.plays, cover: row.photo, photo: true }
          : { name: row.name, plays: row.plays, cover: row.song_cover ?? undefined },
      ),
      topGenres: genreRows.map((row) => ({ name: row.name, plays: row.plays })),
      topAlbums: albumRows.map((row) => ({
        albumId: row.album_id,
        title: row.title,
        artist: row.artist,
        cover: row.cover ?? undefined,
        plays: row.plays,
      })),
      busiestDay,
      longestStreak: longestStreak(dayRows.map((row) => row.day)),
      newArtists: newArtistRows.map((row) => ({ name: row.name, month: row.month })),
    },
    dayPlays,
  };
}

async function fingerprint(userId: string, year: number) {
  const from = startOfDay(`${year}-01-01`);
  const [row] = await sql`
    SELECT count(*) FILTER (WHERE played_at >= ${from}) AS plays,
           coalesce(sum(hashtext(track_id || ' ' || played_at::text)) FILTER (WHERE played_at >= ${from}), 0) AS hash,
           count(*) FILTER (WHERE played_at < ${from}) AS earlier
    FROM plays
    WHERE user_id = ${userId} AND played_at < ${startOfDay(`${year + 1}-01-01`)}`;
  return `${row.plays}:${row.hash}:${row.earlier}`;
}

export async function getYearscape(userId: string, year: number, now = new Date()): Promise<Yearscape> {
  const months = await playMonths(userId);
  const years = [...new Set([Number(localDay(now).slice(0, 4)), ...months.map((m) => Number(m.slice(0, 4)))])].sort(
    (a, b) => b - a,
  );
  const past = year < Number(localDay(now).slice(0, 4));
  const key = keys.yearscape(userId, year);
  const print = `${await fingerprint(userId, year)}${past ? "" : `:${localDay(now)}`}`;
  const cached = await getValue<{ print: string; scape: Omit<Yearscape, "years"> }>(key);
  if (cached?.print === print) return { ...cached.scape, years };

  const from = startOfDay(`${year}-01-01`);
  const to = startOfDay(`${year + 1}-01-01`);
  const { summary } = await summarizeRange(userId, from, to);

  const [monthCountRows, monthSongRows, monthArtistRows] =
    summary.plays > 0
      ? await Promise.all([
          sql`
            SELECT to_char((played_at AT TIME ZONE ${TIME_ZONE})::date, 'YYYY-MM') AS month,
                   count(*)::int AS plays
            FROM plays
            WHERE user_id = ${userId} AND played_at >= ${from} AND played_at < ${to}
            GROUP BY 1`,
          sql`
            WITH counts AS (
              SELECT to_char((p.played_at AT TIME ZONE ${TIME_ZONE})::date, 'YYYY-MM') AS month,
                     p.track_id, t.title, a.name AS artist,
                     count(*)::int AS plays,
                     min(p.played_at) AS first_at
              FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
              WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to}
              GROUP BY 1, p.track_id, t.title, a.name
            ),
            ranked AS (
              SELECT *, row_number() OVER (PARTITION BY month ORDER BY plays DESC, first_at ASC) AS rn
              FROM counts
            )
            SELECT month, track_id, title, artist, plays
            FROM ranked
            WHERE rn = 1`,
          sql`
            WITH counts AS (
              SELECT to_char((p.played_at AT TIME ZONE ${TIME_ZONE})::date, 'YYYY-MM') AS month,
                     a.name,
                     count(*)::int AS plays,
                     min(p.played_at) AS first_at
              FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
              WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to}
              GROUP BY 1, a.id, a.name
            ),
            ranked AS (
              SELECT *, row_number() OVER (PARTITION BY month ORDER BY plays DESC, first_at ASC) AS rn
              FROM counts
            )
            SELECT month, name, plays
            FROM ranked
            WHERE rn = 1`,
        ])
      : [[], [], []];

  const monthPlays = new Map(monthCountRows.map((row) => [row.month as string, row.plays as number]));
  const monthTopSong = new Map(
    monthSongRows.map((row) => [
      row.month as string,
      {
        trackId: row.track_id as string,
        title: row.title as string,
        artist: row.artist as string,
        plays: row.plays as number,
      },
    ]),
  );
  const monthTopArtist = new Map(
    monthArtistRows.map((row) => [row.month as string, { name: row.name as string, plays: row.plays as number }]),
  );

  const scape: Omit<Yearscape, "years"> = {
    year,
    ...summary,
    months: Array.from({ length: 12 }, (_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, "0")}`;
      return {
        month,
        plays: monthPlays.get(month) ?? 0,
        topSong: monthTopSong.get(month),
        topArtist: monthTopArtist.get(month),
      };
    }),
  };
  await setValue(key, { print, scape }, CACHE_SECONDS);
  return { ...scape, years };
}

export async function getMonthscape(userId: string, month: string, now = new Date()): Promise<Monthscape> {
  const months = await playMonths(userId);
  const from = startOfDay(`${month}-01`);
  const to = startOfDay(`${shiftMonth(month, 1)}-01`);
  const { summary, dayPlays } = await summarizeRange(userId, from, to);

  const days: Monthscape["days"] = [];
  for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1)) {
    days.push({ day, plays: dayPlays.get(day) ?? 0 });
  }

  return {
    month,
    ...summary,
    previous: months.length > 0 && month > months[0] ? shiftMonth(month, -1) : undefined,
    next: month < localDay(now).slice(0, 7) ? shiftMonth(month, 1) : undefined,
    days,
  };
}
