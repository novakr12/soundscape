import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { coverUrl, fillCoversFromNavidrome, forgetNavidromeCovers, getCover } from "../../lib/covers";
import { importListens } from "../../lib/imports";
import { saveNavidrome } from "../../lib/navidrome";
import { sql } from "../../lib/postgres";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

process.env.AUTH_SECRET ??= "test-only-secret";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const IMAGE = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const user = testUser();
const rare = trackIdFor(user.artist, "Rare Song");
const missing = trackIdFor(user.artist, "Not In Library");
const deezer = trackIdFor(user.artist, "On Deezer");
const requests: string[] = [];
let server: Server;
let url: string;

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
    requests.push(method);
    const ok = (body: object) => response.end(JSON.stringify({ "subsonic-response": { status: "ok", ...body } }));
    if (method === "ping") return ok({});
    if (method === "search3") {
      const query = (params.get("query") ?? "").toLowerCase();
      const song = query.includes("rare")
        ? [{ id: "song-1", title: "Rare Song (Remastered)", artist: user.artist, coverArt: "mf-1" }]
        : [];
      return ok({ searchResult3: { song } });
    }
    if (method === "getCoverArt" && params.get("id") === "mf-1") {
      response.setHeader("content-type", "image/png");
      return response.end(IMAGE);
    }
    response.statusCode = 404;
    response.end();
  });
}

async function cover(trackId: string): Promise<string | null> {
  const [row] = await sql`SELECT cover FROM tracks WHERE id = ${trackId}`;
  return row?.cover ?? null;
}

before(async () => {
  server = fakeNavidrome();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await createTestUser(user.userId);
  const playedAt = new Date(Date.now() - 86_400_000);
  await importListens(user.userId, [
    { artist: user.artist, title: "Rare Song", playedAt },
    { artist: user.artist, title: "Not In Library", playedAt },
    { artist: user.artist, title: "On Deezer", playedAt },
  ]);
  await sql`UPDATE tracks SET deezer_missing = true WHERE id = ANY(${[rare, missing]})`;
  await sql`UPDATE tracks SET cover = 'https://deezer.example/cover.jpg' WHERE id = ${deezer}`;
});

after(async () => {
  server.close();
  await removeTestUser(user);
  await closeConnections();
});

describe("covers from Navidrome", () => {
  it("does nothing without a Navidrome connection", async () => {
    assert.equal(await fillCoversFromNavidrome(user.userId), 0);
    assert.equal(await cover(rare), null);
  });

  it("fills in covers Deezer could not find, and leaves Deezer covers alone", async () => {
    await saveNavidrome(user.userId, url, "dj", "secret");
    requests.length = 0;
    assert.equal(await fillCoversFromNavidrome(user.userId), 1);
    assert.equal(await cover(rare), coverUrl(rare));
    assert.equal(await cover(missing), null);
    assert.equal(await cover(deezer), "https://deezer.example/cover.jpg");

    requests.length = 0;
    assert.equal(await fillCoversFromNavidrome(user.userId), 0);
    assert.deepEqual(requests, []);
  });

  it("serves the cover through Soundscape and keeps a copy", async () => {
    requests.length = 0;
    const first = await getCover(rare);
    assert.equal(first?.type, "image/png");
    assert.deepEqual(first?.data, IMAGE);
    assert.deepEqual(requests, ["getCoverArt"]);

    requests.length = 0;
    const response = await fetch(`${BASE_URL}${coverUrl(rare)}`);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), IMAGE);
    assert.deepEqual(requests, []);
  });

  it("answers with the fallback note when there is no cover", async () => {
    const response = await fetch(`${BASE_URL}${coverUrl(missing)}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.match(await response.text(), /<svg/);
  });

  it("forgets the covers when Navidrome is disconnected", async () => {
    await forgetNavidromeCovers(user.userId);
    assert.equal(await cover(rare), null);
    assert.equal((await sql`SELECT 1 FROM cover_cache WHERE track_id = ${rare}`).length, 0);
    assert.equal(await getCover(rare), null);
  });
});
