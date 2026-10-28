import { sql } from "./postgres";

export function eventStream(
  request: Request,
  channels: string[],
  toEvent: (channel: string, message: string) => string | null,
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const listeners: { unlisten: () => Promise<void> }[] = [];
      const send = (text: string | null) => {
        if (!closed && text) controller.enqueue(encoder.encode(text));
      };
      const heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        for (const listener of listeners) listener.unlisten().catch(() => {});
        controller.close();
      };

      request.signal.addEventListener("abort", close);
      try {
        for (const channel of channels) {
          const listener = await sql.listen(channel, (message) => send(toEvent(channel, message)));
          if (closed) listener.unlisten().catch(() => {});
          else listeners.push(listener);
        }
      } catch {
        close();
        return;
      }
      send(": connected\n\n");
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
