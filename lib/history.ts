import { sql } from "./postgres";
import { monthRange } from "./time";

export type HistoryEntry = {
  playId: string;
  playedAt: Date;
  trackId: string;
  title: string;
  artist: string;
};

export async function coversFor(trackIds: string[]): Promise<Map<string, string>> {
  const rows = await sql`SELECT id, cover FROM tracks WHERE id = ANY(${[...new Set(trackIds)]}) AND cover IS NOT NULL`;
  return new Map(rows.map((row) => [row.id as string, row.cover as string]));
}

export async function getHistory(userId: string, month: string, limit = 200, offset = 0): Promise<HistoryEntry[]> {
  const { from, to } = monthRange(month);
  const rows = await sql`
    SELECT p.id, p.played_at, p.track_id, t.title, a.name AS artist
    FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to}
    ORDER BY p.played_at DESC, p.id DESC
    LIMIT ${limit} OFFSET ${offset}`;
  return rows.map((row) => ({
    playId: row.id,
    playedAt: row.played_at,
    trackId: row.track_id,
    title: row.title,
    artist: row.artist,
  }));
}

export function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
