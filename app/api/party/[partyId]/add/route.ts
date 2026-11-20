import { readHandedTrack } from "@/lib/devices";
import { addToParty, isPartyId } from "@/lib/parties";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

type Context = { params: Promise<{ partyId: string }> };

export async function POST(request: Request, { params }: Context) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  const { partyId } = await params;
  const body = await request.json().catch(() => null);
  const track = readHandedTrack(body?.track);
  if (!isPartyId(partyId) || !track) return Response.json({ error: "Send a song to add." }, { status: 400 });
  const problem = await addToParty(partyId, userId, track, body?.next === true);
  if (problem) return Response.json({ error: problem }, { status: 409 });
  return Response.json({ ok: true });
}
