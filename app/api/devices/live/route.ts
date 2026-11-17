import { DEVICES_CHANNEL, readDeviceMessage } from "@/lib/player-devices";
import { eventStream } from "@/lib/sse";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  return eventStream(request, [DEVICES_CHANNEL], (_channel, text) => {
    const message = readDeviceMessage(text);
    if (!message || message.user !== userId) return null;
    if (message.type === "device")
      return `event: device\ndata: ${JSON.stringify({ now: Date.now(), device: message.device })}\n\n`;
    if (message.type === "gone") return `event: gone\ndata: ${JSON.stringify({ id: message.id })}\n\n`;
    return `event: command\ndata: ${JSON.stringify({ to: message.to })}\n\n`;
  });
}
