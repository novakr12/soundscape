import { getListeningRecord } from "./milestones";
import { sql } from "./postgres";
import { getListeningTime } from "./stats";
import { localDay, startOfDay } from "./time";

export type Today = { plays: number; listeningMs: number; streak: number; playedToday: boolean };

export async function today(userId: string, now = new Date()): Promise<Today> {
  const [[counted], time, record] = await Promise.all([
    sql`SELECT count(*)::int AS plays FROM plays WHERE user_id = ${userId} AND played_at >= ${startOfDay(localDay(now))}`,
    getListeningTime(userId, 1, now),
    getListeningRecord(userId),
  ]);
  return {
    plays: counted.plays,
    listeningMs: Math.round(time.recent.ms),
    streak: record.currentStreak,
    playedToday: counted.plays > 0,
  };
}
