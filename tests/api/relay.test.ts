import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const other = testUser();
const received: { auth?: string; body: unknown }[] = [];
let server: Server;
let relay: typeof import("../../lib/relay");

before(async () => {
  server = createServer((request, response) => {
    let text = "";
    request.on("data", (chunk) => {
      text += chunk;
    });
    request.on("end", () => {
      if (request.url?.endsWith("/validate-token")) {
        response.end(JSON.stringify({ valid: true, user_name: "lb-user" }));
        return;
      }
      received.push({ auth: request.headers.authorization, body: JSON.parse(text) });
      response.end(JSON.stringify({ status: "ok" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.LISTENBRAINZ_RELAY_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/1/`;
  relay = await import("../../lib/relay");
  await createTestUser(user.userId);
  await createTestUser(other.userId);
  await relay.saveRelay(user.userId, "lb-token");
});

after(async () => {
  server.close();
  await relay.removeRelay(user.userId);
  await removeTestUser(user);
  await removeTestUser(other);
  await closeConnections();
});

describe("ListenBrainz relay for songs played in Soundscape", () => {
  it("sends a full song played in Soundscape like any other scrobble", async () => {
    received.length = 0;
    await relay.relayPlay(user.userId, {
      artist: "In Flames",
      title: "Bullet Ride",
      playedAt: "2026-11-15T12:00:00.000Z",
    });
    assert.equal(received.length, 1);
    assert.equal(received[0].auth, "Token lb-token");
    assert.deepEqual(received[0].body, {
      listen_type: "single",
      payload: [
        {
          listened_at: 1_794_744_000,
          track_metadata: {
            artist_name: "In Flames",
            track_name: "Bullet Ride",
            additional_info: { media_player: "Soundscape", submission_client: "Soundscape" },
          },
        },
      ],
    });
  });

  it("sends nothing for someone who hasn't set up the relay", async () => {
    received.length = 0;
    await relay.relayPlay(other.userId, { artist: "In Flames", title: "Bullet Ride", playedAt: new Date() });
    assert.equal(received.length, 0);
  });
});
