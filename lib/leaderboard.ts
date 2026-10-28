import { sql } from "./postgres";
import { addDays, daysThisWeek, startOfDay } from "./time";

const DEFAULT_SONG_MS = 210_000;

export type LeaderboardRow = {
  userId: string;
  plays: number;
  listeningMs: number;
  topArtist?: { artistId: string; name: string; photo?: string };
};

export type Leaderboard = { rows: LeaderboardRow[]; lastWeek?: LeaderboardRow };

async function ranking(userIds: string[], from: Date, to: Date): Promise<LeaderboardRow[]> {
  const rows = await sql`
    WITH counts AS (
      SELECT p.user_id, t.artist_id, count(*) AS plays,
             coalesce(sum(t.duration_ms), 0) AS known_ms, count(t.duration_ms) AS known_plays
      FROM plays p JOIN tracks t ON t.id = p.track_id
      WHERE p.user_id = ANY(${userIds}) AND p.played_at >= ${from} AND p.played_at < ${to}
      GROUP BY p.user_id, t.artist_id
    ), ranked AS (
      SELECT *,
             sum(plays) OVER (PARTITION BY user_id) AS total,
             sum(known_ms) OVER (PARTITION BY user_id) AS total_known_ms,
             sum(known_plays) OVER (PARTITION BY user_id) AS total_known_plays,
             row_number() OVER (PARTITION BY user_id ORDER BY plays DESC, artist_id) AS position
      FROM counts
    )
    SELECT r.user_id, r.total, r.total_known_ms, r.total_known_plays, a.id AS artist_id, a.name, a.photo
    FROM ranked r JOIN artists a ON a.id = r.artist_id
    WHERE r.position = 1`;
  const played = new Map(
    rows.map((row) => {
      const plays = Number(row.total);
      const knownPlays = Number(row.total_known_plays);
      const knownMs = Number(row.total_known_ms);
      const average = knownPlays > 0 ? knownMs / knownPlays : DEFAULT_SONG_MS;
      return [
        row.user_id as string,
        {
          userId: row.user_id as string,
          plays,
          listeningMs: knownMs + (plays - knownPlays) * average,
          topArtist: { artistId: row.artist_id, name: row.name, ...(row.photo ? { photo: row.photo } : {}) },
        },
      ];
    }),
  );
  return [...new Set(userIds)]
    .map((userId) => played.get(userId) ?? { userId, plays: 0, listeningMs: 0 })
    .sort((a, b) => b.plays - a.plays || b.listeningMs - a.listeningMs || a.userId.localeCompare(b.userId));
}

export async function weeklyLeaderboard(userIds: string[], now = new Date()): Promise<Leaderboard> {
  const monday = daysThisWeek(now)[0];
  const thisWeek = startOfDay(monday);
  const [rows, previous] = await Promise.all([
    ranking(userIds, thisWeek, new Date(now.getTime() + 1)),
    ranking(userIds, startOfDay(addDays(monday, -7)), thisWeek),
  ]);
  const winner = previous[0];
  return { rows, lastWeek: winner && winner.plays > 0 && userIds.length > 1 ? winner : undefined };
}
