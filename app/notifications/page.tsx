import type { Metadata } from "next";
import Link from "next/link";
import { listNotifications, type Notification } from "@/lib/notifications";
import { requireUserId } from "@/lib/session";
import { formatTimeAgo } from "@/lib/time";
import MarkRead from "./mark-read";

export const metadata: Metadata = { title: "Notifications · Soundscape" };

function Message({ notification, userId }: { notification: Notification; userId: string }) {
  const other = notification.otherUser;
  if (notification.kind === "follow" && other) {
    return (
      <>
        <Link href={`/u/${other}`}>{other}</Link> started following you.
      </>
    );
  }
  if (notification.kind === "passed" && other) {
    return (
      <>
        <Link href={`/u/${other}`}>{other}</Link> passed you on <Link href="/feed">this week&apos;s leaderboard</Link>.
      </>
    );
  }
  if (notification.kind === "milestone" && notification.count) {
    return (
      <>
        You reached <Link href={`/u/${userId}`}>{notification.count.toLocaleString("en")} plays</Link>.
      </>
    );
  }
  return null;
}

export default async function NotificationsPage() {
  const userId = await requireUserId();
  const notifications = await listNotifications(userId);
  const now = new Date();

  return (
    <>
      <h1>Notifications</h1>
      {notifications.length === 0 ? (
        <p className="muted">
          Nothing yet. You&apos;ll hear here when someone follows you, when a friend passes you on the weekly
          leaderboard and when you reach a play milestone.
        </p>
      ) : (
        <ul className="notifications">
          {notifications.map((notification) => (
            <li key={notification.id} className={notification.read ? undefined : "unread"}>
              <span>
                <Message notification={notification} userId={userId} />
              </span>
              <time className="muted" dateTime={notification.createdAt.toISOString()}>
                {formatTimeAgo(notification.createdAt, now)}
              </time>
            </li>
          ))}
        </ul>
      )}
      {notifications.some((notification) => !notification.read) && <MarkRead />}
      <p className="muted">Notifications are kept for 90 days.</p>
    </>
  );
}
