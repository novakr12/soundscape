import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { sql } from "../lib/postgres";
import { eventStream } from "../lib/sse";

afterEach(() => mock.restoreAll());

describe("eventStream", () => {
  it("closes immediately without listening when request signal is already aborted", async () => {
    const listenMock = mock.method(sql, "listen", async () => ({ unlisten: async () => {} }));
    const controller = new AbortController();
    controller.abort();
    const request = new Request("http://localhost/api/live/test", { signal: controller.signal });
    const response = eventStream(request, ["ch"], () => null);
    const text = await response.text();
    assert.equal(text, "");
    assert.equal(listenMock.mock.callCount(), 0);
  });

  it("unlistens and ignores late messages when the stream is cancelled", async () => {
    let callback: ((message: string) => void) | undefined;
    let unlistened = 0;
    mock.method(sql, "listen", async (_channel: string, onMessage: (message: string) => void) => {
      callback = onMessage;
      return {
        unlisten: async () => {
          unlistened++;
        },
      };
    });

    const controller = new AbortController();
    const request = new Request("http://localhost/api/live/test", { signal: controller.signal });
    const response = eventStream(request, ["ch"], (_ch, msg) => `data: ${msg}\n\n`);
    const reader = response.body!.getReader();
    const first = await reader.read();
    assert.equal(new TextDecoder().decode(first.value), ": connected\n\n");

    await reader.cancel();
    assert.equal(unlistened, 1);
    assert.doesNotThrow(() => callback?.("after-cancel"));
  });

  it("unlistens cleanly when request signal aborts", async () => {
    let unlistened = 0;
    mock.method(sql, "listen", async () => ({
      unlisten: async () => {
        unlistened++;
      },
    }));

    const controller = new AbortController();
    const request = new Request("http://localhost/api/live/test", { signal: controller.signal });
    const response = eventStream(request, ["ch"], () => null);
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort();
    const ended = await reader.read();
    assert.equal(ended.done, true);
    assert.equal(unlistened, 1);
  });
});
