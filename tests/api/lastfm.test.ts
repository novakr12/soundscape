import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { albumOf } from "../../lib/albums";
import { trackIdFor } from "../../lib/catalog";
import { getHistory } from "../../lib/history";
import { importListens } from "../../lib/imports";
import { deleteValues, getValue, keys, setValue } from "../../lib/kv";
import { getLastfmProgress, getLastfmState, runLastfmImport, startLastfmImport } from "../../lib/lastfm";
import { ImportError } from "../../lib/listenbrainz";
import { monthBucket } from "../../lib/time";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const FAKE_PAGE = 2;
const base = Math.floor(Date.now() / 1000) - 6 * 3600;
const scrobbles = [
  { title: "One", at: base },
  { title: "Two", at: base + 600 },
  { title: "Three", at: base + 1200 },
  { title: "Four", at: base + 1800 },
  { title: "Five", at: base + 2400 },
];
const requests: URLSearchParams[] = [];
let busyOnce = false;
let server: Server;

function fakeLastfm() {
  return createServer((request, response) => {
    const params = new URL(request.url ?? "", "http://localhost").searchParams;
    requests.push(params);
    if (params.get("api_key") !== "test-key")
      return response.end(JSON.stringify({ error: 10, message: "Invalid API key" }));
    if (params.get("user") !== "scrobbler")
      return response.end(JSON.stringify({ error: 6, message: "User not found" }));
    if (busyOnce) {
      busyOnce = false;
      return response.end(JSON.stringify({ error: 29, message: "Rate limit exceeded" }));
    }
    const from = Number(params.get("from") ?? 0);
    const to = Number(params.get("to") ?? Infinity);
    const page = Number(params.get("page"));
    const matching = scrobbles.filter((s) => s.at >= from && s.at <= to).reverse();
    const pages = Math.ceil(matching.length / FAKE_PAGE);
    const track = matching.slice((page - 1) * FAKE_PAGE, page * FAKE_PAGE).map((s) => ({
      name: s.title,
      artist: { "#text": user.artist },
      album: { "#text": "Scrobbled Album" },
      mbid: "",
      date: { uts: String(s.at) },
    }));
    if (page === 1)
      track.unshift({
        name: "Playing",
        artist: { "#text": user.artist },
        album: { "#text": "" },
        mbid: "",
        "@attr": { nowplaying: "true" },
      } as never);
    response.end(
      JSON.stringify({
        recenttracks: { track, "@attr": { totalPages: String(pages), total: String(matching.length) } },
      }),
    );
  });
}

async function titles() {
  const plays = [];
  for (const month of new Set([monthBucket(new Date(base * 1000)), monthBucket(new Date())])) {
    plays.push(...(await getHistory(user.userId, month)));
  }
  return plays.map((play) => play.title).sort();
}

before(async () => {
  server = fakeLastfm();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.LASTFM_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  process.env.LASTFM_API_KEY = "test-key";
  process.env.LASTFM_REQUEST_GAP_MS = "0";
  process.env.DEEZER_API_URL = "http://127.0.0.1:9";
  await createTestUser(user.userId);
  await importListens(user.userId, [{ artist: user.artist, title: "Two", playedAt: new Date((base + 630) * 1000) }]);
});

after(async () => {
  server.close();
  await deleteValues(keys.lastfmProgress(user.userId));
  await removeTestUser(user);
  await closeConnections();
});

describe("Last.fm import", () => {
  it("explains unknown users and bad keys", async () => {
    await assert.rejects(startLastfmImport(user.userId, "nobody"), new ImportError("No Last.fm user named nobody"));
    process.env.LASTFM_API_KEY = "wrong";
    await assert.rejects(startLastfmImport(user.userId, "scrobbler"), /API key isn't valid/);
    process.env.LASTFM_API_KEY = "test-key";
    assert.equal(await getValue(keys.importLock(user.userId)), null);
  });

  it("imports the whole history oldest page first and skips plays you already have", async () => {
    busyOnce = true;
    const run = await startLastfmImport(user.userId, "scrobbler");
    assert.deepEqual([run.progress.total, run.progress.pages, run.progress.done], [5, 3, false]);
    await assert.rejects(startLastfmImport(user.userId, "scrobbler"), /already running/);

    requests.length = 0;
    const progress = await runLastfmImport(user.userId, run);
    assert.deepEqual(
      requests.map((params) => params.get("page")),
      ["3", "2", "1"],
    );
    assert.deepEqual([progress.done, progress.imported, progress.skipped, progress.error], [true, 4, 1, undefined]);
    assert.deepEqual(await titles(), ["Five", "Four", "One", "Three", "Two"]);
    assert.equal((await albumOf(trackIdFor(user.artist, "Four")))?.title, "Scrobbled Album");
    assert.deepEqual((await getLastfmState(user.userId))?.listenedUpTo, new Date(scrobbles[4].at * 1000));
    assert.equal((await getLastfmProgress(user.userId))?.imported, 4);
    assert.equal(await getValue(keys.importLock(user.userId)), null);
  });

  it("only fetches newer scrobbles the next time", async () => {
    scrobbles.push({ title: "Six", at: base + 3000 });
    const run = await startLastfmImport(user.userId, "scrobbler");
    assert.equal(run.from, scrobbles[4].at + 1);
    assert.equal(run.progress.total, 1);
    const progress = await runLastfmImport(user.userId, run);
    assert.equal(progress.imported, 1);
    assert.deepEqual(await titles(), ["Five", "Four", "One", "Six", "Three", "Two"]);

    const nothing = await startLastfmImport(user.userId, "scrobbler");
    assert.deepEqual([nothing.progress.total, nothing.progress.done], [0, true]);
    assert.equal(await getValue(keys.importLock(user.userId)), null);
  });

  it("says when an import stopped without finishing", async () => {
    const value = await getValue<object>(keys.lastfmProgress(user.userId));
    await setValue(keys.lastfmProgress(user.userId), { ...value, done: false });
    const stalled = await getLastfmProgress(user.userId, Date.now() + 4 * 60_000);
    assert.equal(stalled?.done, true);
    assert.match(stalled?.error ?? "", /continue where it left off/);
  });
});
