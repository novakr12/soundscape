import { sql } from "./postgres";
import { addDays, localDay, startOfDay } from "./time";

const YEARS_BACK = 10;
const SONGS = 3;

export type ThatDaySong = { trackId: string; title: string; artist: string; plays: number };
export type ThatDay = { year: number; yearsAgo: number; plays: number; songs: ThatDaySong[] };

function sameDay(year: number, today: string) {
  const day = `${year}${today.slice(4)}`;
  return addDays(day, 0) === day ? day : null;
}

export async function onThisDay(userId: string, now = new Date()): Promise<ThatDay[]> {
  const today = localDay(now);
  const thisYear = Number(today.slice(0, 4));
  const ranges: { year: number; from: Date; to: Date }[] = [];
  for (let i = 0; i < YEARS_BACK; i++) {
    const year = thisYear - i - 1;
    const day = sameDay(year, today);
    if (day) ranges.push({ year, from: startOfDay(day), to: startOfDay(addDays(day, 1)) });
  }
  if (ranges.length === 0) return [];

  const years = ranges.map((range) => range.year);
  const froms = ranges.map((range) => range.from);
  const tos = ranges.map((range) => range.to);
  const rows = await sql`
    WITH ranges AS (
      SELECT *
      FROM unnest(${years}::int[], ${froms}::timestamptz[], ${tos}::timestamptz[]) AS r(year, from_at, to_at)
    ),
    grouped AS (
      SELECT r.year,
             p.track_id,
             t.title AS track_title,
             a.name AS artist_name,
             count(*)::int AS plays,
             min(p.played_at) AS first_at,
             sum(count(*)) OVER (PARTITION BY r.year)::int AS day_plays,
             row_number() OVER (PARTITION BY r.year ORDER BY count(*) DESC, min(p.played_at) ASC) AS rank
      FROM ranges r
      JOIN plays p ON p.user_id = ${userId} AND p.played_at >= r.from_at AND p.played_at < r.to_at
      JOIN tracks t ON t.id = p.track_id
      JOIN artists a ON a.id = t.artist_id
      GROUP BY r.year, p.track_id, t.title, a.name
    )
    SELECT year, day_plays, track_id, track_title, artist_name, plays
    FROM grouped
    WHERE rank <= ${SONGS}
    ORDER BY year DESC, rank ASC`;

  const byYear = new Map<number, ThatDay>();
  for (const row of rows) {
    let entry = byYear.get(row.year);
    if (!entry) {
      entry = {
        year: row.year,
        yearsAgo: thisYear - row.year,
        plays: row.day_plays,
        songs: [],
      };
      byYear.set(row.year, entry);
    }
    entry.songs.push({
      trackId: row.track_id,
      title: row.track_title,
      artist: row.artist_name,
      plays: row.plays,
    });
  }
  return [...byYear.values()];
}
