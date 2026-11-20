import { listFollowers, listFollowing } from "@/lib/follows";
import { notifyParty } from "@/lib/notifications";
import { currentParty, isPartyId } from "@/lib/parties";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

type Context = { params: Promise<{ partyId: string }> };

const MOST_INVITES = 20;

export async function POST(request: Request, { params }: Context) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  const { partyId } = await params;
  const body = await request.json().catch(() => null);
  const asked: unknown[] = Array.isArray(body?.users) ? body.users.slice(0, MOST_INVITES) : [];
  const party = await currentParty(userId);
  if (!isPartyId(partyId) || party?.id !== partyId || party.role !== "host") {
    return Response.json({ error: "Only the host can invite people." }, { status: 403 });
  }
  const friends = new Set([...(await listFollowers(userId)), ...(await listFollowing(userId))]);
  const invited = asked.filter((user): user is string => typeof user === "string" && friends.has(user));
  for (const user of invited) await notifyParty(userId, user, partyId);
  return Response.json({ invited });
}
