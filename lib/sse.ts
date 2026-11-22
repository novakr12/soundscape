import { sql } from "./postgres";

const ENCODER = new TextEncoder();
const PING_BYTES = ENCODER.encode(": ping\n\n");
const CONNECTED_BYTES = ENCODER.encode(": connected\n\n");

export function eventStream(
  request: Request,
  channels: string[],
  toEvent: (channel: string, message: string) => string | null,
) {
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

      const enqueue = (chunk: Uint8Array) => {
        if (closed) return;
        if (controller.desiredSize !== null && controller.desiredSize <= -10) {
          close(false);
          return;
        }
        try {
          controller.enqueue(chunk);
        } catch {
          close(true);
        }
      };

      const send = (text: string | null) => {
        if (closed || !text) return;
        enqueue(ENCODER.encode(text));
      };

      if (request.signal.aborted) {
        close(false);
        return;
      }

      request.signal.addEventListener("abort", onAbort, { once: true });
      heartbeat = setInterval(() => {
        if (controller.desiredSize === null || controller.desiredSize > 0) enqueue(PING_BYTES);
      }, 25_000);
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
      enqueue(CONNECTED_BYTES);
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
