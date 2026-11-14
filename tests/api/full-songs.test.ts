import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { findFullSong, forgetFullSongs, getNavidrome, saveNavidrome, streamSong } from "../../lib/navidrome";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

process.env.AUTH_SECRET ??= "test-only-secret";

const user = testUser();
const stranger = testUser();
const audio = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
const library = [{ id: "song-1", title: "Owned Song", artist: user.artist }];
let server: Server;
let url: string;

function subsonic(body: Record<string, unknown>) {
  return JSON.stringify({ "subsonic-response": { status: "ok", version: "1.16.1", ...body } });
}

function fakeNavidrome() {
  return createServer((request, response) => {
    const address = new URL(request.url ?? "", "http://localhost");
    const params = address.searchParams;
    const token = createHash("md5")
      .update(`secret${params.get("s")}`)
      .digest("hex");
    if (params.get("u") !== "dj" || params.get("t") !== token) {
      response.end(JSON.stringify({ "subsonic-response": { status: "failed", error: { code: 40 } } }));
      return;
    }
    const method = address.pathname.replace(/^\/rest\/|\.view$/g, "");
    if (method === "ping") return response.end(subsonic({}));
    if (method === "search3") {
      const words = (params.get("query") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const song = library.filter((s) => words.every((word) => `${s.artist} ${s.title}`.toLowerCase().includes(word)));
      return response.end(subsonic({ searchResult3: { song } }));
    }
    if (method === "stream") {
      if (params.get("id") !== "song-1") {
        response.setHeader("content-type", "application/json");
        return response.end(JSON.stringify({ "subsonic-response": { status: "failed", error: { code: 70 } } }));
      }
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
      response.setHeader("content-type", "audio/mpeg");
      response.setHeader("accept-ranges", "bytes");
      response.setHeader("x-navidrome-secret", "do-not-pass");
      if (!range) {
        response.setHeader("content-length", audio.length);
        return response.end(audio);
      }
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : audio.length - 1;
      response.statusCode = 206;
      response.setHeader("content-range", `bytes ${start}-${end}/${audio.length}`);
      response.setHeader("content-length", end - start + 1);
      return response.end(audio.subarray(start, end + 1));
    }
    response.statusCode = 404;
    response.end();
  });
}

before(async () => {
  server = fakeNavidrome();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await createTestUser(user.userId);
  await createTestUser(stranger.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: "Owned Song", playedAt: new Date(Date.now() - 3_600_000) },
    { artist: user.artist, title: "Missing Song", playedAt: new Date(Date.now() - 7_200_000) },
  ]);
  await saveNavidrome(user.userId, url, "dj", "secret");
});

after(async () => {
  server.close();
  await removeTestUser(user);
  await removeTestUser(stranger);
  await closeConnections();
});

describe("Full songs from Navidrome", () => {
  it("finds the song in your own Navidrome only", async () => {
    forgetFullSongs();
    assert.equal(await findFullSong(user.userId, trackIdFor(user.artist, "Owned Song")), "song-1");
    assert.equal(await findFullSong(user.userId, trackIdFor(user.artist, "Missing Song")), null);
    assert.equal(await findFullSong(user.userId, "no-such-track"), null);
    assert.equal(await findFullSong(stranger.userId, trackIdFor(user.artist, "Owned Song")), null);
  });

  it("remembers what it found for a while", async () => {
    forgetFullSongs();
    const trackId = trackIdFor(user.artist, "Missing Song");
    const now = Date.now();
    assert.equal(await findFullSong(user.userId, trackId, now), null);
    library.push({ id: "song-2", title: "Missing Song", artist: user.artist });
    assert.equal(await findFullSong(user.userId, trackId, now + 60_000), null);
    assert.equal(await findFullSong(user.userId, trackId, now + 11 * 60_000), "song-2");
    library.pop();
  });

  it("streams the whole song, or the part the player asks for", async () => {
    const navidrome = (await getNavidrome(user.userId))!;
    const whole = await streamSong(navidrome, "song-1", null);
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get("content-type"), "audio/mpeg");
    assert.equal(whole.headers.get("cache-control"), "private, no-store");
    assert.equal(whole.headers.get("x-navidrome-secret"), null);
    assert.deepEqual(Buffer.from(await whole.arrayBuffer()), audio);

    const part = await streamSong(navidrome, "song-1", "bytes=100-199");
    assert.equal(part.status, 206);
    assert.equal(part.headers.get("content-range"), "bytes 100-199/1000");
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), audio.subarray(100, 200));
  });

  it("refuses odd song ids and songs Navidrome can't play", async () => {
    const navidrome = (await getNavidrome(user.userId))!;
    assert.equal((await streamSong(navidrome, "../../rest/ping", null)).status, 404);
    assert.equal((await streamSong(navidrome, "song-9", null)).status, 404);
    assert.equal((await streamSong({ ...navidrome, url: "http://127.0.0.1:9" }, "song-1", null)).status, 502);
  });
});
