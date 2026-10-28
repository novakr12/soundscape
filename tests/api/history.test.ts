import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getHistory } from "../../lib/history";
import { importListens } from "../../lib/imports";
import { startSession } from "../../lib/sessions";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const user = testUser();
const at = (iso: string) => new Date(iso);

before(async () => {
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: "Halloween", playedAt: at("2025-10-31T22:30:00Z") },
    { artist: user.artist, title: "First Of November", playedAt: at("2025-10-31T23:30:00Z") },
    ...Array.from({ length: 205 }, (_, i) => ({
      artist: user.artist,
      title: `Song ${i}`,
      playedAt: new Date(at("2025-11-10T12:00:00Z").getTime() + i * 60_000),
    })),
  ]);
});

after(async () => {
  await removeTestUser(user);
  await closeConnections();
});

describe("history", () => {
  it("puts plays in the month they happened in local time", async () => {
    assert.deepEqual(
      (await getHistory(user.userId, "2025-10")).map((play) => play.title),
      ["Halloween"],
    );
    const november = await getHistory(user.userId, "2025-11", 1000);
    assert.equal(november.length, 206);
    assert.equal(november.at(-1)?.title, "First Of November");
  });

  it("pages through a month with more than 200 plays", async () => {
    const cookie = `soundscape_session=${await startSession(user.userId)}`;
    const first = await (await fetch(`${BASE_URL}/history?month=2025-11`, { headers: { cookie } })).text();
    assert.match(first, /Song 204/);
    assert.doesNotMatch(first, /First Of November/);
    assert.match(first, /page=2/);
    const second = await (await fetch(`${BASE_URL}/history?month=2025-11&page=2`, { headers: { cookie } })).text();
    assert.match(second, /First Of November/);
    assert.match(second, /Song 0/);
    assert.doesNotMatch(second, /Song 204/);
  });
});
