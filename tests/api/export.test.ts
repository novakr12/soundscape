import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { exportLines, exportPlays } from "../../lib/export";
import { importListens } from "../../lib/imports";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function text(lines: AsyncGenerator<string>) {
  let out = "";
  for await (const line of lines) out += line;
  return out;
}

before(async () => {
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: 'Say "Hi", Again', playedAt: new Date("2025-11-03T10:00:00Z") },
    { artist: user.artist, title: "Second", playedAt: new Date("2026-01-05T09:00:00Z") },
    { artist: user.artist, title: "Third", playedAt: new Date("2026-01-05T11:00:00Z") },
  ]);
});

after(async () => {
  await removeTestUser(user);
  await closeConnections();
});

describe("exporting plays", () => {
  it("lists every play oldest first across months", async () => {
    const plays = [];
    for await (const play of exportPlays(user.userId)) plays.push(play);
    assert.deepEqual(
      plays.map((play) => [play.playedAt, play.title, play.artist]),
      [
        ["2025-11-03T10:00:00.000Z", 'Say "Hi", Again', user.artist],
        ["2026-01-05T09:00:00.000Z", "Second", user.artist],
        ["2026-01-05T11:00:00.000Z", "Third", user.artist],
      ],
    );
  });

  it("writes JSON that the JSON importer reads", async () => {
    const rows = JSON.parse(await text(exportLines(user.userId, "json")));
    assert.equal(rows.length, 3);
    assert.deepEqual(Object.keys(rows[0]).sort(), ["artist", "playedAt", "title", "trackId"]);
    assert.equal(rows[0].title, 'Say "Hi", Again');
  });

  it("writes CSV with quoted fields", async () => {
    const lines = (await text(exportLines(user.userId, "csv"))).trimEnd().split("\n");
    assert.equal(lines[0], "played_at,artist,title,track_id");
    assert.equal(lines.length, 4);
    assert.match(lines[1], /^2025-11-03T10:00:00\.000Z,.+,"Say ""Hi"", Again",/);
  });

  it("writes an empty JSON list for someone with no plays", async () => {
    assert.deepEqual(JSON.parse(await text(exportLines(`${user.userId}-nobody`, "json"))), []);
  });

  it("refuses to export without logging in", async () => {
    const response = await fetch(`${BASE_URL}/api/export?format=csv`);
    assert.equal(response.status, 401);
  });
});
