import { isPartyId, partyFor } from "@/lib/parties";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ partyId: string }> };

export async function GET(request: Request, { params }: Context) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  const { partyId } = await params;
  const party = isPartyId(partyId) ? await partyFor(partyId, userId) : null;
  if (!party) return Response.json({ error: "This party has ended." }, { status: 404 });
  return Response.json({ party });
}
