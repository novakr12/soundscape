import { getValue, keys, setValue } from "./kv";
import { sql } from "./postgres";
import { addDays, localDay, TIME_ZONE } from "./time";

export const MILESTONES = [
  1, 100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
];
const CACHE_SECONDS = 10 * 60;

export type Milestone = { count: number; playedAt: string; trackId: string; title: string; artist: string };

export type ListeningRecord = {
  plays: number;
  milestones: Milestone[];
  nextMilestone?: number;
  currentStreak: number;
  playedToday: boolean;
  longestStreak: { days: number; from: string; to: string } | null;
};

function streaks(days: string[], today: string) {
  let longest: ListeningRecord["longestStreak"] = null;
  let start = days[0];
  for (let i = 0; i < days.length; i++) {
    if (i > 0 && addDays(days[i - 1], 1) !== days[i]) start = days[i];
    const length = Math.round((Date.parse(days[i]) - Date.parse(start)) / 86_400_000) + 1;
    if (!longest || length > longest.days) longest = { days: length, from: start, to: days[i] };
  }
  const played = new Set(days);
  let day = played.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (played.has(day)) {
    current++;
    day = addDays(day, -1);
  }
  return { longest, current, playedToday: played.has(today) };
}

export async function computeListeningRecord(userId: string, now = new Date()): Promise<ListeningRecord> {
  const dayRows = await sql`
    SELECT to_char((played_at AT TIME ZONE ${TIME_ZONE})::date, 'YYYY-MM-DD') AS day,
           count(*)::int AS plays
    FROM plays
    WHERE user_id = ${userId}
    GROUP BY 1
    ORDER BY 1 ASC`;

  const days: string[] = [];
  let plays = 0;
  for (const row of dayRows) {
    days.push(row.day);
    plays += row.plays;
  }

  const reached = MILESTONES.filter((count) => count <= plays);
  const milestoneRows =
    reached.length > 0
      ? await sql`
          WITH numbered AS (
            SELECT p.played_at,
                   p.track_id,
                   row_number() OVER (ORDER BY p.played_at ASC, p.id ASC) AS rn
            FROM plays p
            WHERE p.user_id = ${userId}
          )
          SELECT n.rn::int AS count, n.played_at, n.track_id, t.title AS track_title, a.name AS artist_name
          FROM numbered n
          JOIN tracks t ON t.id = n.track_id
          JOIN artists a ON a.id = t.artist_id
          WHERE n.rn = ANY(${reached}::bigint[])
          ORDER BY n.rn ASC`
      : [];

  const milestones: Milestone[] = milestoneRows.map((row) => ({
    count: row.count,
    playedAt: (row.played_at as Date).toISOString(),
    trackId: row.track_id,
    title: row.track_title,
    artist: row.artist_name,
  }));

  const { longest, current, playedToday } = streaks(days, localDay(now));
  return {
    plays,
    milestones,
    nextMilestone: MILESTONES.find((count) => count > plays),
    currentStreak: current,
    playedToday,
    longestStreak: longest,
  };
}

export async function getListeningRecord(userId: string): Promise<ListeningRecord> {
  const cached = await getValue<ListeningRecord>(keys.listeningRecord(userId));
  if (cached) return cached;
  const record = await computeListeningRecord(userId);
  await setValue(keys.listeningRecord(userId), record, CACHE_SECONDS);
  return record;
}
