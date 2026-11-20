import { listFollowers, listFollowing } from "@/lib/follows";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  const friends = new Set([...(await listFollowers(userId)), ...(await listFollowing(userId))]);
  return Response.json({ friends: [...friends].sort() });
}
