import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  connectLastfm,
  getLastfmScrobbling,
  removeLastfmScrobbling,
  scrobbleToLastfm,
  sendAllLastfmQueues,
  sendNowPlayingToLastfm,
  signature,
  waitingForLastfm,
} from "../../lib/lastfm-scrobble";
import { sql } from "../../lib/postgres";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

process.env.AUTH_SECRET ??= "test-only-secret";

const user = testUser();
const other = testUser();
const SECRET = "test-shared-secret";
const KEY = "test-api-key";
type Call = Record<string, string>;
const calls: Call[] = [];
let mode: "ok" | "down" | "busy" | "revoked" | "bad" = "ok";
let server: Server;
let saved: Record<string, string | undefined> = {};

function signed(params: Call) {
  const text = Object.keys(params)
    .filter((name) => name !== "format" && name !== "api_sig")
    .sort()
    .map((name) => name + params[name])
    .join("");
  return createHash("md5")
    .update(text + SECRET, "utf8")
    .digest("hex");
}

function fakeLastfm() {
  return createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    const query = new URL(request.url ?? "", "http://localhost").searchParams;
    const params = Object.fromEntries(request.method === "POST" ? new URLSearchParams(text) : query) as Call;
    calls.push(params);
    const reply = (body: unknown, status = 200) => {
      response.statusCode = status;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(body));
    };
    if (params.api_key !== KEY || params.api_sig !== signed(params)) return reply({ error: 13, message: "bad sig" });
    if (params.method === "auth.getSession") {
      return params.token === "good-token"
        ? reply({ session: { name: "lfm-listener", key: "session-key-1", subscriber: 0 } })
        : reply({ error: 4, message: "Invalid token" }, 403);
    }
    if (mode === "down") {
      response.statusCode = 503;
      return response.end("<html>down</html>");
    }
    if (mode === "busy") return reply({ error: 11, message: "Service Offline" });
    if (mode === "revoked") return reply({ error: 9, message: "Invalid session key" }, 403);
    if (mode === "bad") return reply({ error: 6, message: "Invalid parameters" }, 400);
    if (params.sk !== "session-key-1") return reply({ error: 9, message: "Invalid session key" }, 403);
    if (params.method === "track.updateNowPlaying") return reply({ nowplaying: {} });
    if (params.method === "track.scrobble") {
      const count = Object.keys(params).filter((name) => name.startsWith("timestamp[")).length;
      return reply({ scrobbles: { "@attr": { accepted: count, ignored: 0 } } });
    }
    reply({ error: 3, message: "Invalid method" });
  });
}

const scrobbles = () => calls.filter((call) => call.method === "track.scrobble");
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

before(async () => {
  server = fakeLastfm();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  saved = {
    LASTFM_API_URL: process.env.LASTFM_API_URL,
    LASTFM_API_KEY: process.env.LASTFM_API_KEY,
    LASTFM_SHARED_SECRET: process.env.LASTFM_SHARED_SECRET,
  };
  process.env.LASTFM_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/2.0/`;
  process.env.LASTFM_API_KEY = KEY;
  process.env.LASTFM_SHARED_SECRET = SECRET;
  await createTestUser(user.userId);
  await createTestUser(other.userId);
});

beforeEach(() => {
  calls.length = 0;
  mode = "ok";
});

after(async () => {
  server.close();
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await removeTestUser(user);
  await removeTestUser(other);
  await closeConnections();
});

describe("Scrobbling to Last.fm", () => {
  it("signs requests the way Last.fm expects", () => {
    assert.equal(
      signature({ method: "auth.getSession", api_key: "key", token: "tok", format: "json" }, "shh"),
      createHash("md5").update("api_keykeymethodauth.getSessiontokentokshh").digest("hex"),
    );
  });

  it("connects with the token Last.fm hands back and keeps the session key encrypted", async () => {
    await assert.rejects(connectLastfm(user.userId, "../odd token"), /odd answer/);
    await assert.rejects(connectLastfm(user.userId, "wrong-token"), /didn't accept/);
    assert.equal(await getLastfmScrobbling(user.userId), null);

    assert.deepEqual(await connectLastfm(user.userId, "good-token"), {
      lastfmUser: "lfm-listener",
      needsReconnect: false,
    });
    const [row] = await sql`SELECT session_key FROM lastfm_scrobbling WHERE user_id = ${user.userId}`;
    assert.notEqual(row.session_key, "session-key-1");
  });

  it("sends now playing and recent plays, but not old ones or other people's", async () => {
    await sendNowPlayingToLastfm(user.userId, {
      artist: "Air",
      title: "Playground Love",
      album: "Virgin Suicides",
      durationMs: 213_000,
    });
    const playing = calls.find((call) => call.method === "track.updateNowPlaying");
    assert.equal(playing?.artist, "Air");
    assert.equal(playing?.album, "Virgin Suicides");
    assert.equal(playing?.duration, "213");

    const playedAt = minutesAgo(3);
    await scrobbleToLastfm(user.userId, [
      { artist: "Air", title: "Playground Love", album: "Virgin Suicides", playedAt, durationMs: 213_000 },
      { artist: "Air", title: "Too Old", playedAt: minutesAgo(15 * 24 * 60) },
      { artist: " ", title: "No artist", playedAt },
    ]);
    assert.equal(scrobbles().length, 1);
    assert.equal(scrobbles()[0]["track[0]"], "Playground Love");
    assert.equal(scrobbles()[0]["timestamp[0]"], String(Math.floor(playedAt.getTime() / 1000)));
    assert.equal(scrobbles()[0]["track[1]"], undefined);

    await scrobbleToLastfm(other.userId, [{ artist: "Air", title: "Not connected", playedAt }]);
    assert.equal(scrobbles().length, 1);
    assert.equal(await waitingForLastfm(user.userId), 0);
  });

  it("sends at most 50 plays at a time", async () => {
    const plays = Array.from({ length: 120 }, (_, i) => ({
      artist: "Bonobo",
      title: `Song ${i}`,
      playedAt: minutesAgo(200 - i),
    }));
    await scrobbleToLastfm(user.userId, plays);
    assert.deepEqual(
      scrobbles().map((call) => Object.keys(call).filter((name) => name.startsWith("track[")).length),
      [50, 50, 20],
    );
    assert.equal(await waitingForLastfm(user.userId), 0);
  });

  it("keeps plays while Last.fm is down and sends them later", async () => {
    mode = "down";
    await scrobbleToLastfm(user.userId, [{ artist: "Massive Attack", title: "Teardrop", playedAt: minutesAgo(1) }]);
    mode = "busy";
    await scrobbleToLastfm(user.userId, [{ artist: "Massive Attack", title: "Angel", playedAt: minutesAgo(1) }]);
    assert.equal(await waitingForLastfm(user.userId), 2);

    mode = "ok";
    calls.length = 0;
    await sendAllLastfmQueues();
    assert.equal(scrobbles().length, 1);
    assert.deepEqual([scrobbles()[0]["track[0]"], scrobbles()[0]["track[1]"]], ["Teardrop", "Angel"]);
    assert.equal(await waitingForLastfm(user.userId), 0);
  });

  it("drops plays Last.fm calls invalid instead of trying forever", async () => {
    mode = "bad";
    await scrobbleToLastfm(user.userId, [{ artist: "x", title: "y", playedAt: minutesAgo(1) }]);
    assert.equal(await waitingForLastfm(user.userId), 0);
  });

  it("pauses when Last.fm revokes the session and catches up after connecting again", async () => {
    mode = "revoked";
    await scrobbleToLastfm(user.userId, [{ artist: "Khruangbin", title: "Time (You and I)", playedAt: minutesAgo(2) }]);
    assert.deepEqual(await getLastfmScrobbling(user.userId), { lastfmUser: "lfm-listener", needsReconnect: true });
    assert.equal(await waitingForLastfm(user.userId), 1);

    mode = "ok";
    calls.length = 0;
    await sendNowPlayingToLastfm(user.userId, { artist: "Khruangbin", title: "Maria También" });
    await sendAllLastfmQueues();
    assert.equal(calls.length, 0);

    await connectLastfm(user.userId, "good-token");
    assert.equal((await getLastfmScrobbling(user.userId))?.needsReconnect, false);
    assert.equal(scrobbles()[0]["track[0]"], "Time (You and I)");
    assert.equal(await waitingForLastfm(user.userId), 0);
  });

  it("forgets plays older than two weeks and everything when you disconnect", async () => {
    mode = "down";
    await scrobbleToLastfm(user.userId, [{ artist: "Air", title: "Kelly Watch the Stars", playedAt: minutesAgo(10) }]);
    assert.equal(await waitingForLastfm(user.userId), 1);
    await sendAllLastfmQueues(Date.now() + 15 * 24 * 60 * 60 * 1000);
    assert.equal(await waitingForLastfm(user.userId), 0);

    await scrobbleToLastfm(user.userId, [{ artist: "Air", title: "Sexy Boy", playedAt: minutesAgo(1) }]);
    await removeLastfmScrobbling(user.userId);
    assert.equal(await waitingForLastfm(user.userId), 0);
    assert.equal(await getLastfmScrobbling(user.userId), null);
  });
});
