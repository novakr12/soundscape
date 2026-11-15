import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { request, USER_AGENT } from "../lib/http";

let server: Server;
let url = "";

before(async () => {
  server = createServer((incoming, response) => {
    if (incoming.url === "/slow") {
      setTimeout(() => response.end("late"), 300);
      return;
    }
    response.end(JSON.stringify({ agent: incoming.headers["user-agent"], accept: incoming.headers.accept }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

describe("calling other services", () => {
  it("says who is asking, unless the caller says otherwise", async () => {
    assert.deepEqual(await (await request(url, { headers: { accept: "application/json" } })).json(), {
      agent: USER_AGENT,
      accept: "application/json",
    });
    assert.equal((await (await request(url, { headers: { "user-agent": "custom" } })).json()).agent, "custom");
  });

  it("gives up after the timeout", async () => {
    await assert.rejects(request(`${url}/slow`, { timeoutMs: 50 }));
  });

  it("leaves the timing to a caller that brings its own signal", async () => {
    const response = await request(`${url}/slow`, { timeoutMs: 50, signal: new AbortController().signal });
    assert.equal(await response.text(), "late");
  });
});
