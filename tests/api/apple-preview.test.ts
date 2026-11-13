import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { AppleUnreachable, applePreviewFor } from "../../lib/apple-preview";
import { importListens } from "../../lib/imports";
import { sql } from "../../lib/postgres";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const searches: URLSearchParams[] = [];
let answer = 200;

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  searches.push(url.searchParams);
  const term = url.searchParams.get("term") ?? "";
  const results = term.includes("Known Song")
    ? [
        {
          kind: "song",
          artistName: user.artist,
          trackName: "Known Song",
          previewUrl: "https://audio.example/known.m4a",
        },
      ]
    : [];
  response
    .writeHead(answer, { "content-type": "application/json" })
    .end(JSON.stringify({ resultCount: results.length, results }));
});

const trackId = async (title: string) => {
  const [row] = await sql`
    SELECT t.id FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE a.name = ${user.artist} AND t.title = ${title}`;
  return row.id as string;
};

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.ITUNES_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.APPLE_MUSIC_COUNTRY = "RS";
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: "Known Song", playedAt: new Date(Date.now() - 120_000) },
    { artist: user.artist, title: "Unknown Song", playedAt: new Date(Date.now() - 60_000) },
  ]);
});

after(async () => {
  server.close();
  await removeTestUser(user);
  await closeConnections();
});

describe("Apple Music previews", () => {
  it("finds a preview, remembers it and doesn't ask again for a month", async () => {
    const id = await trackId("Known Song");
    searches.length = 0;
    assert.equal(await applePreviewFor(id), "https://audio.example/known.m4a");
    assert.equal(searches.length, 1);
    assert.equal(searches[0].get("entity"), "song");
    assert.equal(searches[0].get("country"), "rs");
    assert.equal(await applePreviewFor(id), "https://audio.example/known.m4a");
    assert.equal(searches.length, 1);
    assert.equal(await applePreviewFor(id, Date.now() + 31 * 24 * 60 * 60 * 1000), "https://audio.example/known.m4a");
    assert.equal(searches.length, 2);
  });

  it("remembers when Apple has no preview either", async () => {
    const id = await trackId("Unknown Song");
    searches.length = 0;
    assert.equal(await applePreviewFor(id), null);
    assert.equal(await applePreviewFor(id), null);
    assert.equal(searches.length, 1);
  });

  it("asks again later when Apple is busy instead of remembering nothing", async () => {
    const id = await trackId("Known Song");
    await sql`UPDATE tracks SET apple_preview = NULL, apple_checked_at = NULL WHERE id = ${id}`;
    answer = 403;
    await assert.rejects(() => applePreviewFor(id), AppleUnreachable);
    const [row] = await sql`SELECT apple_checked_at FROM tracks WHERE id = ${id}`;
    assert.equal(row.apple_checked_at, null);
    answer = 200;
    assert.equal(await applePreviewFor(id), "https://audio.example/known.m4a");
  });

  it("knows nothing about songs that don't exist", async () => {
    assert.equal(await applePreviewFor("no-such-track"), null);
  });
});
