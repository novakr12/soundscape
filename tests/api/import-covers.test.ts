import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { findCoversAfterImport, getCoverProgress, startCoverSearch } from "../../lib/covers";
import { importListens } from "../../lib/imports";
import { sql } from "../../lib/postgres";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const other = testUser();
const searches: string[] = [];
let quotaOnce = true;
let server: Server;

function fakeDeezer() {
  return createServer((request, response) => {
    const query = new URL(request.url ?? "", "http://localhost").searchParams.get("q") ?? "";
    searches.push(query);
    if (quotaOnce) {
      quotaOnce = false;
      return response.end(JSON.stringify({ error: { type: "Exception", message: "Quota limit exceeded", code: 4 } }));
    }
    const title = ["Found Song", "Another Found"].find((name) => query.includes(name));
    const cover = `https://covers.example/${title?.length}.jpg`;
    const data = title
      ? [{ id: title.length, title, duration: 200, artist: { name: user.artist }, album: { cover_medium: cover } }]
      : [];
    response.end(JSON.stringify({ data }));
  });
}

async function track(title: string, artist = user.artist) {
  const [row] = await sql`SELECT cover, deezer_missing FROM tracks WHERE id = ${trackIdFor(artist, title)}`;
  return { cover: row.cover, missing: row.deezer_missing };
}

before(async () => {
  server = fakeDeezer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.DEEZER_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.DEEZER_REQUEST_GAP_MS = "0";
  process.env.MUSICBRAINZ_URL = "http://127.0.0.1:9/ws/2";

  await createTestUser(user.userId);
  await createTestUser(other.userId);
  const playedAt = new Date(Date.now() - 3_600_000);
  await importListens(user.userId, [
    { artist: user.artist, title: "Found Song", playedAt },
    { artist: user.artist, title: "Missing Song", playedAt },
    { artist: user.artist, title: "Another Found", playedAt },
  ]);
  await importListens(other.userId, [{ artist: other.artist, title: "Not Mine", playedAt }]);
});

after(async () => {
  server.close();
  await removeTestUser(user);
  await removeTestUser(other);
  await closeConnections();
});

describe("covers after an import", () => {
  it("counts the imported songs that still need a cover", async () => {
    assert.deepEqual(await startCoverSearch(user.userId), { done: false, checked: 0, total: 3, found: 0 });
    assert.deepEqual(await getCoverProgress(user.userId), { done: false, checked: 0, total: 3, found: 0 });
  });

  it("looks up every imported song, waiting once when Deezer says to slow down", async () => {
    const progress = await startCoverSearch(user.userId);
    await findCoversAfterImport(user.userId, progress);
    assert.deepEqual(await getCoverProgress(user.userId), { done: true, checked: 3, total: 3, found: 2 });
    assert.equal((await track("Found Song")).cover, "https://covers.example/10.jpg");
    assert.equal((await track("Another Found")).cover, "https://covers.example/13.jpg");
    assert.equal((await track("Missing Song")).missing, true);
    assert.equal(quotaOnce, false);
  });

  it("leaves other people's songs for their own imports", async () => {
    assert.ok(!searches.some((query) => query.includes("Not Mine")));
    assert.equal((await track("Not Mine", other.artist)).missing, false);
  });

  it("is done straight away when nothing needs a cover", async () => {
    assert.deepEqual(await startCoverSearch(user.userId), { done: true, checked: 0, total: 0, found: 0 });
  });
});
