import { visibleFollowing } from "@/lib/feed";
import { getListeningNow } from "@/lib/live";
import { tokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await tokenUser(request);
  if (!userId) return unauthorized();
  const following = new Set(await visibleFollowing(userId));
  const listening = (await getListeningNow()).filter((now) => following.has(now.userId));
  return Response.json({
    listening: listening.map((now) => ({
      user: now.userId,
      trackId: now.trackId,
      title: now.title,
      artist: now.artist,
      ...(now.startedAt ? { startedAt: new Date(now.startedAt).toISOString() } : {}),
      url: `/u/${encodeURIComponent(now.userId)}`,
    })),
  });
}
