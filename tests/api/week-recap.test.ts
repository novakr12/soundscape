import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { artistIdFor, trackIdFor } from "../../lib/catalog";
import { follow } from "../../lib/follows";
import { importListens } from "../../lib/imports";
import { lastWeekRecap, showWeekRecap } from "../../lib/week-recap";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const me = testUser();
const friend = testUser();
const loner = testUser();
const fresh = `${me.artist} Fresh`;
const at = (iso: string) => new Date(iso);
const monday = at("2026-03-09T09:00:00Z");

before(async () => {
  for (const user of [me, friend, loner]) await createTestUser(user.userId);
  await follow(me.userId, friend.userId);
  await importListens(me.userId, [
    { artist: me.artist, title: "Known", playedAt: at("2026-02-24T12:00:00Z") },
    { artist: me.artist, title: "Known", playedAt: at("2026-02-25T12:00:00Z") },
    { artist: me.artist, title: "Favourite", playedAt: at("2026-03-02T12:00:00Z"), durationMs: 200_000 },
    { artist: me.artist, title: "Favourite", playedAt: at("2026-03-04T12:00:00Z"), durationMs: 200_000 },
    { artist: fresh, title: "New One", playedAt: at("2026-03-05T12:00:00Z"), durationMs: 100_000 },
    { artist: fresh, title: "New Two", playedAt: at("2026-03-06T12:00:00Z"), durationMs: 100_000 },
    { artist: fresh, title: "New Three", playedAt: at("2026-03-08T12:00:00Z"), durationMs: 100_000 },
    { artist: me.artist, title: "This Week", playedAt: at("2026-03-09T08:00:00Z") },
  ]);
  await importListens(friend.userId, [
    ...[1, 2, 3, 4, 5, 6].map((n) => ({
      artist: friend.artist,
      title: "Loop",
      playedAt: new Date(at("2026-03-03T12:00:00Z").getTime() + n * 60_000),
    })),
  ]);
});

after(async () => {
  for (const user of [me, friend, loner]) await removeTestUser(user);
  await removeTestUser({ ...me, artist: fresh });
  await closeConnections();
});

describe("your week", () => {
  it("shows on Monday and Tuesday only", () => {
    assert.equal(showWeekRecap(monday), true);
    assert.equal(showWeekRecap(at("2026-03-10T20:00:00Z")), true);
    assert.equal(showWeekRecap(at("2026-03-11T09:00:00Z")), false);
    assert.equal(showWeekRecap(at("2026-03-08T20:00:00Z")), false);
  });

  it("sums up last week from Monday to Sunday", async () => {
    const recap = await lastWeekRecap(me.userId, monday);
    assert.equal(recap?.from, "2026-03-02");
    assert.equal(recap?.to, "2026-03-08");
    assert.equal(recap?.plays, 5);
    assert.equal(recap?.playsBefore, 2);
    assert.equal(recap?.listeningMs, 700_000);
    assert.equal(recap?.topSong?.trackId, trackIdFor(me.artist, "Favourite"));
    assert.equal(recap?.topArtist?.artistId, artistIdFor(fresh));
    assert.equal(recap?.newArtists, 1);
  });

  it("places you among the people you follow", async () => {
    assert.deepEqual((await lastWeekRecap(me.userId, monday))?.place, { rank: 2, of: 2 });
  });

  it("is empty for a week without plays", async () => {
    assert.equal(await lastWeekRecap(loner.userId, monday), null);
  });
});
