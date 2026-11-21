import { sql } from "./postgres";

export function eventStream(
  request: Request,
  channels: string[],
  toEvent: (channel: string, message: string) => string | null,
) {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const listeners: { unlisten: () => Promise<void> }[] = [];
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const close = (fromCancel = false) => {
        if (closed) return;
        closed = true;
        request.signal.removeEventListener("abort", onAbort);
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        for (const listener of listeners.splice(0)) listener.unlisten().catch(() => {});
        if (!fromCancel) {
          try {
            controller.close();
          } catch {}
        }
      };

      const onAbort = () => close(false);
      cleanup = () => close(true);

      const send = (text: string | null) => {
        if (closed || !text) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          close(true);
        }
      };

      if (request.signal.aborted) {
        close(false);
        return;
      }

      request.signal.addEventListener("abort", onAbort, { once: true });
      heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
      try {
        for (const channel of channels) {
          if (closed) return;
          const listener = await sql.listen(channel, (message) => send(toEvent(channel, message)));
          if (closed) listener.unlisten().catch(() => {});
          else listeners.push(listener);
        }
      } catch {
        close(false);
        return;
      }
      send(": connected\n\n");
    },
    cancel() {
      cleanup();
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
