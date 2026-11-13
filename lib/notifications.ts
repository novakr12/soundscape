import { visibleFollowing } from "./feed";
import { every } from "./jobs";
import { getValue, keys, setValue } from "./kv";
import { ranking } from "./leaderboard";
import { MILESTONES } from "./milestones";
import { sql } from "./postgres";
import { type PushMessage, sendPush } from "./push";
import { daysThisWeek, startOfDay } from "./time";

const KEEP_DAYS = 90;
const CHECK_EVERY_MS = 5 * 60 * 1000;
const PAGE_SIZE = 50;

export type NotificationKind = "follow" | "passed" | "milestone";

export type Notification = {
  id: number;
  kind: NotificationKind;
  otherUser?: string;
  count?: number;
  createdAt: Date;
  read: boolean;
};

type New = {
  userId: string;
  kind: NotificationKind;
  dedupe: string;
  otherUser?: string;
  count?: number;
  read?: boolean;
};

export function notificationMessage(
  userId: string,
  { kind, otherUser, count }: { kind: NotificationKind; otherUser?: string; count?: number },
): PushMessage {
  if (kind === "follow")
    return { title: "New follower", body: `${otherUser} started following you.`, url: `/u/${otherUser}` };
  if (kind === "passed") {
    return { title: "Leaderboard", body: `${otherUser} passed you on this week's leaderboard.`, url: "/feed" };
  }
  return { title: "Milestone", body: `You reached ${(count ?? 0).toLocaleString("en")} plays.`, url: `/u/${userId}` };
}

const sending = new Set<Promise<number>>();

export async function pushesSent() {
  await Promise.all([...sending]);
}

async function add({ userId, kind, dedupe, otherUser, count, read }: New) {
  const rows = await sql`
    INSERT INTO notifications (user_id, kind, other_user, count, dedupe, read_at)
    VALUES (${userId}, ${kind}, ${otherUser ?? null}, ${count ?? null}, ${dedupe}, ${read ? new Date() : null})
    ON CONFLICT (user_id, dedupe) DO NOTHING
    RETURNING id`;
  if (rows.length > 0 && !read) {
    const message = { ...notificationMessage(userId, { kind, otherUser, count }), tag: `${kind}:${dedupe}` };
    const push = sendPush(userId, message).catch(() => 0);
    sending.add(push);
    push.finally(() => sending.delete(push));
  }
  return rows.length > 0;
}

export async function notifyFollow(follower: string, followee: string) {
  return add({ userId: followee, kind: "follow", otherUser: follower, dedupe: `follow:${follower}` });
}

const visible = sql`(n.other_user IS NULL OR n.kind = 'follow' OR NOT EXISTS (
  SELECT 1 FROM users u WHERE u.username = n.other_user AND u.is_private))`;

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await sql`
    SELECT count(*) AS unread FROM notifications n
    WHERE n.user_id = ${userId} AND n.read_at IS NULL AND ${visible}`;
  return Number(row.unread);
}

export async function listNotifications(userId: string, limit = PAGE_SIZE): Promise<Notification[]> {
  const rows = await sql`
    SELECT n.id, n.kind, n.other_user, n.count, n.created_at, n.read_at
    FROM notifications n
    WHERE n.user_id = ${userId} AND ${visible}
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT ${limit}`;
  return rows.map((row) => ({
    id: Number(row.id),
    kind: row.kind as NotificationKind,
    ...(row.other_user ? { otherUser: row.other_user as string } : {}),
    ...(row.count !== null ? { count: Number(row.count) } : {}),
    createdAt: row.created_at as Date,
    read: row.read_at !== null,
  }));
}

export async function markAllRead(userId: string) {
  await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${userId} AND read_at IS NULL`;
}

export async function checkMilestones(userIds?: string[]) {
  const rows = await sql`
    SELECT p.user_id, sum(p.plays) AS plays,
           (SELECT max(count) FROM notifications n WHERE n.user_id = p.user_id AND n.kind = 'milestone') AS told
    FROM user_track_plays p
    ${userIds ? sql`WHERE p.user_id = ANY(${userIds})` : sql``}
    GROUP BY p.user_id`;
  let sent = 0;
  for (const row of rows) {
    const plays = Number(row.plays);
    const reached = MILESTONES.filter((count) => count <= plays).pop();
    if (!reached || (row.told !== null && Number(row.told) >= reached)) continue;
    const first = row.told === null;
    if (
      await add({
        userId: row.user_id,
        kind: "milestone",
        count: reached,
        dedupe: `milestone:${reached}`,
        read: first && reached > MILESTONES[1],
      })
    )
      sent++;
  }
  return { checked: rows.length, found: sent };
}

export async function checkLeaderboardPasses(userIds?: string[], now = new Date()) {
  const users = userIds ?? (await sql`SELECT DISTINCT follower FROM follows`).map((row) => row.follower as string);
  const week = daysThisWeek(now)[0];
  const from = startOfDay(week);
  const to = new Date(now.getTime() + 1);
  let sent = 0;
  for (const userId of users) {
    const following = await visibleFollowing(userId);
    if (following.length === 0) continue;
    const rows = await ranking([userId, ...following], from, to);
    const mine = rows.find((row) => row.userId === userId)?.plays ?? 0;
    const above = rows.filter((row) => row.userId !== userId && row.plays > mine).map((row) => row.userId);
    const before = await getValue<{ week: string; above: string[] }>(keys.leaderboardAbove(userId));
    if (before?.week === week && mine > 0) {
      for (const other of above.filter((id) => !before.above.includes(id))) {
        if (await add({ userId, kind: "passed", otherUser: other, dedupe: `passed:${week}:${other}` })) sent++;
      }
    }
    await setValue(keys.leaderboardAbove(userId), { week, above }, 8 * 24 * 60 * 60);
  }
  return { checked: users.length, found: sent };
}

export async function removeOldNotifications(now = new Date()) {
  await sql`DELETE FROM notifications WHERE created_at < ${new Date(now.getTime() - KEEP_DAYS * 86_400_000)}`;
}

export async function checkNotifications() {
  const milestones = await checkMilestones();
  const passes = await checkLeaderboardPasses();
  await removeOldNotifications();
  return { checked: milestones.checked, found: milestones.found + passes.found };
}

export function startNotificationChecks() {
  every("notifications", CHECK_EVERY_MS, checkNotifications);
}
