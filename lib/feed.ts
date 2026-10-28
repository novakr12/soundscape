import { listFollowing } from "./follows";
import { coversFor, type HistoryEntry, shiftMonth } from "./history";
import { sql } from "./postgres";
import { privateUsers } from "./privacy";
import { monthBucket, monthRange } from "./time";

export type FeedItem = HistoryEntry & { userId: string; cover?: string };

export async function visibleFollowing(userId: string): Promise<string[]> {
  const following = await listFollowing(userId);
  const hidden = await privateUsers(following);
  return following.filter((other) => !hidden.has(other));
}

export async function getFeed(userIds: string[], limit = 50, now = new Date()): Promise<FeedItem[]> {
  if (userIds.length === 0) return [];
  const { from } = monthRange(shiftMonth(monthBucket(now), -1));
  const rows = await sql`
    SELECT p.id, p.user_id, p.played_at, p.track_id, t.title, a.name AS artist
    FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ANY(${userIds}) AND p.played_at >= ${from}
    ORDER BY p.played_at DESC, p.id DESC
    LIMIT ${limit}`;
  const items = rows.map((row) => ({
    playId: row.id as string,
    userId: row.user_id as string,
    playedAt: row.played_at as Date,
    trackId: row.track_id as string,
    title: row.title as string,
    artist: row.artist as string,
  }));

  const covers = await coversFor(items.map((item) => item.trackId));
  return items.map((item) => ({ ...item, cover: covers.get(item.trackId) }));
}
