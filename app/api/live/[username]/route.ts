import { USER_CHANNEL } from "@/lib/live";
import { isPrivate } from "@/lib/privacy";
import { currentUserId } from "@/lib/session";
import { eventStream } from "@/lib/sse";
import { userExists } from "@/lib/users";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

export async function GET(request: Request, { params }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const [exists, viewer, hidden] = await Promise.all([userExists(username), currentUserId(), isPrivate(username)]);
  if (!exists || (hidden && viewer !== username)) return new Response(null, { status: 404 });

  return eventStream(request, [USER_CHANNEL], (_channel, message) => {
    const { userId, event } = JSON.parse(message) as { userId: string; event: string };
    return userId === username ? `event: ${event}\ndata: {}\n\n` : null;
  });
}
