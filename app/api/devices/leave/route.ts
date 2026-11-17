import { isDeviceId } from "@/lib/devices";
import { leaveDevice } from "@/lib/player-devices";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

export async function POST(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!isDeviceId(body?.id)) return Response.json({ error: "Send the device id." }, { status: 400 });
  await leaveDevice(userId, body.id);
  return Response.json({ ok: true });
}
