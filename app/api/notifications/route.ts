import { listNotifications, notificationMessage, unreadCount } from "@/lib/notifications";
import { userForAuthorization } from "@/lib/tokens";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await userForAuthorization(request.headers.get("authorization"), request.headers.get("user-agent"));
  if (!userId) return Response.json({ error: "Invalid authorization token." }, { status: 401 });
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
