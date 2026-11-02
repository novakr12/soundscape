import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getHistory } from "../../lib/history";
import { importListens } from "../../lib/imports";
import { getValue, keys } from "../../lib/kv";
import { editPlay } from "../../lib/play-edits";
import { getYearscape } from "../../lib/yearscape";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const { artist } = user;
const now = new Date("2026-06-01T12:00:00Z");
const at = (iso: string) => new Date(iso);

before(async () => {
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist, title: "Spring", playedAt: at("2025-04-01T12:00:00Z") },
    { artist, title: "Spring", playedAt: at("2025-04-02T12:00:00Z") },
    { artist, title: "This Year", playedAt: at("2026-02-01T12:00:00Z") },
  ]);
});

after(async () => {
  await removeTestUser(user);
  await removeTestUser({ ...user, artist: `${artist} Fixed` });
  await closeConnections();
});

describe("Yearscape cache", () => {
  it("keeps past years and gives the same answer from the cache", async () => {
    const fresh = await getYearscape(user.userId, 2025, now);
    assert.notEqual(await getValue(keys.yearscape(user.userId, 2025)), null);
    assert.deepEqual(await getYearscape(user.userId, 2025, now), JSON.parse(JSON.stringify(fresh)));
    assert.equal(fresh.plays, 2);
  });

  it("does not keep the current year", async () => {
    await getYearscape(user.userId, 2026, now);
    assert.equal(await getValue(keys.yearscape(user.userId, 2026)), null);
  });

  it("notices new and edited plays in that year", async () => {
    await importListens(user.userId, [{ artist, title: "Autumn", playedAt: at("2025-10-01T12:00:00Z") }]);
    const added = await getYearscape(user.userId, 2025, now);
    assert.equal(added.plays, 3);

    const [play] = (await getHistory(user.userId, "2025-10")).filter((p) => p.title === "Autumn");
    await editPlay(user.userId, { playId: play.playId, playedAt: play.playedAt }, `${artist} Fixed`, "Autumn");
    const edited = await getYearscape(user.userId, 2025, now);
    assert.deepEqual(
      edited.newArtists.map((a) => a.name),
      [artist, `${artist} Fixed`],
    );
  });

  it("notices older plays that change which artists were new", async () => {
    await importListens(user.userId, [{ artist, title: "Long Ago", playedAt: at("2024-01-01T12:00:00Z") }]);
    const scape = await getYearscape(user.userId, 2025, now);
    assert.deepEqual(
      scape.newArtists.map((a) => a.name),
      [`${artist} Fixed`],
    );
  });
});
