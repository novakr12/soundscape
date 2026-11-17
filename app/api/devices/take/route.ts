import { isDeviceId } from "@/lib/devices";
import { takeCommands } from "@/lib/player-devices";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!isDeviceId(body?.id)) return Response.json({ error: "Send the device id." }, { status: 400 });
  return Response.json({ commands: await takeCommands(userId, body.id) });
}
