import { sql } from "./postgres";
import { addDays, startOfDay } from "./time";

export type ChartRow = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  plays: number;
  listeners: number;
};

export async function getChartWithTracks(days: string[], limit = 10): Promise<ChartRow[]> {
  const rows = await sql`
    SELECT p.track_id, t.title, a.name AS artist, t.cover, count(*) AS plays, count(DISTINCT p.user_id) AS listeners
    FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.played_at >= ${startOfDay(days[0])} AND p.played_at < ${startOfDay(addDays(days.at(-1)!, 1))}
    GROUP BY p.track_id, t.id, a.id
    ORDER BY plays DESC, listeners DESC, t.title
    LIMIT ${limit}`;
  return rows.map((row) => ({
    trackId: row.track_id,
    title: row.title,
    artist: row.artist,
    cover: row.cover ?? undefined,
    plays: row.plays,
    listeners: row.listeners,
  }));
}
