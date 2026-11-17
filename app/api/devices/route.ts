import { readDeviceReport } from "@/lib/devices";
import { listDevices, reportDevice } from "@/lib/player-devices";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  return Response.json({ now: Date.now(), devices: await listDevices(userId) });
}

export async function POST(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  const report = readDeviceReport(await request.json().catch(() => null));
  if (!report) return Response.json({ error: "Send id, name, kind and state." }, { status: 400 });
  const device = await reportDevice(userId, report);
  return Response.json({ now: Date.now(), device });
}
