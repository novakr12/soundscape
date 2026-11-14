import { listNotifications, notificationMessage, unreadCount } from "@/lib/notifications";
import { tokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await tokenUser(request);
  if (!userId) return unauthorized();
  const after = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
  const [notifications, unread] = await Promise.all([listNotifications(userId), unreadCount(userId)]);
  return Response.json({
    user: userId,
    unread,
    notifications: notifications
      .filter((notification) => notification.id > after)
      .map((notification) => ({
        id: notification.id,
        kind: notification.kind,
        read: notification.read,
        createdAt: notification.createdAt.toISOString(),
        ...notificationMessage(userId, notification),
      })),
  });
}
