import { isDeviceId } from "@/lib/devices";
import { currentParty, endParty, leaveParty, startParty } from "@/lib/parties";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  return Response.json({ party: await currentParty(userId) });
}

export async function POST(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  const body = await request.json().catch(() => null);
  const deviceId = isDeviceId(body?.deviceId) ? body.deviceId : undefined;
  const started = await startParty(userId, deviceId);
  if (typeof started !== "string") return Response.json(started, { status: 409 });
  return Response.json({ party: await currentParty(userId) });
}

export async function DELETE(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  if (!(await endParty(userId))) await leaveParty(userId);
  return Response.json({ party: null });
}
