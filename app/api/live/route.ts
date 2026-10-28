import { LISTENING_CHANNEL, PLAYS_CHANNEL } from "@/lib/live";
import { eventStream } from "@/lib/sse";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return eventStream(request, [PLAYS_CHANNEL, LISTENING_CHANNEL], (channel, message) =>
    channel === PLAYS_CHANNEL ? `data: ${message}\n\n` : "event: listening\ndata: {}\n\n",
  );
}
