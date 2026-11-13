import { visibleFollowing } from "./feed";
import { shiftMonth } from "./history";
import { sql } from "./postgres";
import { monthBucket, monthRange, TIME_ZONE, WEEKDAYS } from "./time";

const MIN_PLAYS = 20;

export type ClockHour = { hour: number; you: number; following?: number };

export type ListeningClock = {
  hours: ClockHour[];
  following: number;
  peakHour: number;
  followingPeakHour?: number;
  busiestDay: string;
  weekendShare: number;
  kind: "early bird" | "daytime listener" | "evening listener" | "night owl";
};

const shares = (counts: number[]) => {
  const total = counts.reduce((sum, count) => sum + count, 0);
  return counts.map((count) => (total > 0 ? count / total : 0));
};

const peak = (values: number[]) => values.reduce((best, value, hour) => (value > values[best] ? hour : best), 0);

export function listenerKind(hour: number): ListeningClock["kind"] {
  if (hour >= 5 && hour < 10) return "early bird";
  if (hour >= 10 && hour < 17) return "daytime listener";
  if (hour >= 17 && hour < 22) return "evening listener";
  return "night owl";
}

export async function getListeningClock(
  userId: string,
  grid: number[][],
  months = 12,
  now = new Date(),
): Promise<ListeningClock | null> {
  const total = grid.flat().reduce((sum, plays) => sum + plays, 0);
  if (total === 0) return null;
  const you = shares(Array.from({ length: 24 }, (_, hour) => grid.reduce((sum, row) => sum + row[hour], 0)));
  const days = grid.map((row) => row.reduce((sum, plays) => sum + plays, 0));

  const following = await visibleFollowing(userId);
  const { from } = monthRange(shiftMonth(monthBucket(now), 1 - months));
  const rows = following.length
    ? await sql`
        SELECT user_id, extract(hour FROM played_at AT TIME ZONE ${TIME_ZONE})::int AS hour, count(*)::int AS plays
        FROM plays
        WHERE user_id = ANY(${following}) AND played_at >= ${from}
        GROUP BY user_id, hour`
    : [];
  const perUser = new Map<string, number[]>();
  for (const row of rows) {
    const counts = perUser.get(row.user_id) ?? Array<number>(24).fill(0);
    counts[row.hour] = row.plays;
    perUser.set(row.user_id, counts);
  }
  const friends = [...perUser.values()].filter((counts) => counts.reduce((a, b) => a + b, 0) >= MIN_PLAYS).map(shares);
  const average = friends.length
    ? Array.from({ length: 24 }, (_, hour) => friends.reduce((sum, friend) => sum + friend[hour], 0) / friends.length)
    : null;

  const peakHour = peak(you);
  return {
    hours: you.map((share, hour) => ({ hour, you: share, ...(average ? { following: average[hour] } : {}) })),
    following: friends.length,
    peakHour,
    ...(average ? { followingPeakHour: peak(average) } : {}),
    busiestDay: WEEKDAYS[peak(days)],
    weekendShare: (days[5] + days[6]) / total,
    kind: listenerKind(peakHour),
  };
}
