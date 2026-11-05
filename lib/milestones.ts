import { getValue, keys, setValue } from "./kv";
import { sql } from "./postgres";
import { addDays, localDay } from "./time";

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
  const days = new Set<string>();
  const milestones: Milestone[] = [];
  let plays = 0;
  const cursor = sql`
    SELECT p.played_at, p.track_id, t.title AS track_title, a.name AS artist_name
    FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ${userId}
    ORDER BY p.played_at, p.id`.cursor(5000);
  for await (const rows of cursor) {
    for (const row of rows) {
      plays++;
      days.add(localDay(row.played_at));
      if (MILESTONES.includes(plays)) {
        milestones.push({
          count: plays,
          playedAt: row.played_at.toISOString(),
          trackId: row.track_id,
          title: row.track_title,
          artist: row.artist_name,
        });
      }
    }
  }

  const { longest, current, playedToday } = streaks([...days].sort(), localDay(now));
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
