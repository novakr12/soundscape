import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { setPrivate } from "../../lib/privacy";
import { getAlsoPlayed, getTrack, getTrackPlaysPerDay, getYourPlays } from "../../lib/tracks";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const fan = testUser();
const friend = testUser();
const hidden = testUser();
const artist = fan.artist;
const song = (title: string) => trackIdFor(artist, title);
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

before(async () => {
  for (const user of [fan, friend, hidden]) await createTestUser(user.userId);
  await setPrivate(hidden.userId, true);
  await importListens(fan.userId, [
    { artist, title: "Main Song", playedAt: minutesAgo(30) },
    { artist, title: "Main Song", playedAt: minutesAgo(20) },
    { artist, title: "Fan Favourite", playedAt: minutesAgo(10) },
  ]);
  await importListens(friend.userId, [
    { artist, title: "Main Song", playedAt: minutesAgo(15) },
    { artist, title: "Fan Favourite", playedAt: minutesAgo(12) },
    { artist, title: "Friend Pick", playedAt: minutesAgo(5) },
  ]);
  await importListens(hidden.userId, [
    { artist, title: "Main Song", playedAt: minutesAgo(8) },
    { artist, title: "Secret Song", playedAt: minutesAgo(4) },
  ]);
});

after(async () => {
  for (const user of [fan, friend, hidden]) await removeTestUser({ ...user, artist });
  await closeConnections();
});

describe("song pages", () => {
  it("counts every play and listener, private ones included", async () => {
    const track = await getTrack(song("Main Song"));
    assert.equal(track?.title, "Main Song");
    assert.equal(track?.artist, artist);
    assert.equal(track?.plays, 4);
    assert.equal(track?.listeners, 3);
  });

  it("returns null for an unknown song", async () => {
    assert.equal(await getTrack(song("Does Not Exist")), null);
  });

  it("shows your own play count", async () => {
    assert.equal(await getYourPlays(fan.userId, song("Main Song")), 2);
    assert.equal(await getYourPlays(friend.userId, song("Secret Song")), 0);
  });

  it("counts plays per day for the last 30 days", async () => {
    const daily = await getTrackPlaysPerDay(song("Main Song"));
    assert.equal(daily.length, 30);
    assert.equal(
      daily.reduce((sum, d) => sum + d.plays, 0),
      4,
    );
  });

  it("suggests songs that public listeners also play, most shared first", async () => {
    const also = await getAlsoPlayed(song("Main Song"));
    assert.deepEqual(
      also.map((t) => [t.title, t.listeners]),
      [
        ["Fan Favourite", 2],
        ["Friend Pick", 1],
      ],
    );
  });

  it("never reveals what a private listener plays", async () => {
    const also = await getAlsoPlayed(song("Main Song"));
    assert.equal(
      also.some((t) => t.title === "Secret Song"),
      false,
    );
    assert.deepEqual(await getAlsoPlayed(song("Secret Song")), []);
  });
});
