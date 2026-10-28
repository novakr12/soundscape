import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { artistIdFor, trackIdFor } from "../../lib/catalog";
import { compareYears } from "../../lib/compare";
import { importListens } from "../../lib/imports";
import { setPrivate } from "../../lib/privacy";
import { startSession } from "../../lib/sessions";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const me = testUser();
const friend = testUser();
const hidden = testUser();
const shared = `${me.artist} Shared`;
const at = (iso: string) => new Date(iso);

before(async () => {
  for (const user of [me, friend, hidden]) await createTestUser(user.userId);
  await setPrivate(hidden.userId, true);
  await importListens(me.userId, [
    { artist: shared, title: "Both", playedAt: at("2025-03-01T12:00:00Z") },
    { artist: shared, title: "Both", playedAt: at("2025-03-02T12:00:00Z") },
    { artist: shared, title: "Mine Too", playedAt: at("2025-03-03T12:00:00Z") },
    { artist: me.artist, title: "Just Me", playedAt: at("2025-04-01T12:00:00Z") },
    { artist: me.artist, title: "Older", playedAt: at("2024-06-01T12:00:00Z") },
  ]);
  await importListens(friend.userId, [
    { artist: shared, title: "Both", playedAt: at("2025-05-01T12:00:00Z") },
    { artist: friend.artist, title: "Just Them", playedAt: at("2025-05-02T12:00:00Z") },
    { artist: friend.artist, title: "Just Them", playedAt: at("2025-05-03T12:00:00Z") },
  ]);
});

after(async () => {
  for (const user of [me, friend, hidden]) await removeTestUser(user);
  await removeTestUser({ ...me, artist: shared });
  await closeConnections();
});

describe("comparing a year", () => {
  it("puts both Yearscapes side by side with a taste match for that year", async () => {
    const comparison = await compareYears(me.userId, friend.userId, 2025, at("2026-10-27T12:00:00Z"));
    assert.equal(comparison.mine.plays, 4);
    assert.equal(comparison.theirs.plays, 3);
    assert.deepEqual(comparison.years.slice(0, 3), [2026, 2025, 2024]);
    assert.equal(comparison.sharedArtistCount, 1);
    assert.equal(comparison.score, Math.round((100 * Math.sqrt(3 * 1)) / Math.sqrt(4 * 3)));
  });

  it("lists the artists and songs you share and the ones only one of you played", async () => {
    const comparison = await compareYears(me.userId, friend.userId, 2025);
    assert.deepEqual(
      comparison.sharedArtists.map((a) => [a.artistId, a.mine, a.theirs]),
      [[artistIdFor(shared), 3, 1]],
    );
    assert.deepEqual(
      comparison.onlyMine.map((a) => [a.artistId, a.mine]),
      [[artistIdFor(me.artist), 1]],
    );
    assert.deepEqual(
      comparison.onlyTheirs.map((a) => [a.artistId, a.theirs]),
      [[artistIdFor(friend.artist), 2]],
    );
    assert.deepEqual(
      comparison.sharedSongs.map((s) => [s.trackId, s.mine, s.theirs]),
      [[trackIdFor(shared, "Both"), 2, 1]],
    );
  });

  it("has no score when one of you did not play that year", async () => {
    const comparison = await compareYears(me.userId, friend.userId, 2024);
    assert.equal(comparison.mine.plays, 1);
    assert.equal(comparison.theirs.plays, 0);
    assert.equal(comparison.score, null);
  });

  it("shows the page to a logged-in listener, but not for private profiles or yourself", async () => {
    const cookie = `soundscape_session=${await startSession(me.userId)}`;
    const page = await fetch(`${BASE_URL}/u/${friend.userId}/compare?year=2025`, { headers: { cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Artists you both played/);
    const privatePage = await fetch(`${BASE_URL}/u/${hidden.userId}/compare`, { headers: { cookie } });
    assert.equal(privatePage.status, 404);
    const self = await fetch(`${BASE_URL}/u/${me.userId}/compare?year=2025`, {
      headers: { cookie },
      redirect: "manual",
    });
    assert.equal(self.status, 307);
    assert.match(self.headers.get("location") ?? "", /\/yearscape\?year=2025$/);
    const loggedOut = await fetch(`${BASE_URL}/u/${friend.userId}/compare`, { redirect: "manual" });
    assert.equal(loggedOut.status, 307);
  });
});
