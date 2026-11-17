import { isDeviceId, readDeviceCommand } from "@/lib/devices";
import { sendCommand } from "@/lib/player-devices";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

export async function POST(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  const body = await request.json().catch(() => null);
  const command = readDeviceCommand(body?.command);
  if (!isDeviceId(body?.to) || !command) return Response.json({ error: "Send to and a command." }, { status: 400 });
  if (command.do === "send" && command.to === body.to) {
    return Response.json({ error: "A device can't send its music to itself." }, { status: 400 });
  }
  if (!(await sendCommand(userId, body.to, command))) {
    return Response.json({ error: "That device isn't online any more." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
