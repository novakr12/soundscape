import { isDeviceId } from "@/lib/devices";
import { currentParty, isPartyId, joinParty } from "@/lib/parties";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

type Context = { params: Promise<{ partyId: string }> };

export async function POST(request: Request, { params }: Context) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  const { partyId } = await params;
  const body = await request.json().catch(() => null);
  if (!isPartyId(partyId) || !isDeviceId(body?.deviceId)) {
    return Response.json({ error: "Send the device that should play the party." }, { status: 400 });
  }
  const problem = await joinParty(partyId, userId, body.deviceId);
  if (problem) return Response.json({ error: problem }, { status: 409 });
  return Response.json({ party: await currentParty(userId) });
}
