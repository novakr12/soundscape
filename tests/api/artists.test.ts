import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getArtist, getSimilarArtists, getTopSongs, getYourArtistPlays } from "../../lib/artists";
import { slug } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { setPrivate } from "../../lib/privacy";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const fan = testUser();
const friend = testUser();
const hidden = testUser();
const main = fan.artist;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

before(async () => {
  for (const user of [fan, friend, hidden]) await createTestUser(user.userId);
  await setPrivate(hidden.userId, true);
  await importListens(fan.userId, [
    { artist: main, title: "Hit", playedAt: minutesAgo(40) },
    { artist: main, title: "Hit", playedAt: minutesAgo(30) },
    { artist: main, title: "Deep Cut", playedAt: minutesAgo(20) },
    { artist: friend.artist, title: "Shared Taste", playedAt: minutesAgo(10) },
  ]);
  await importListens(friend.userId, [
    { artist: main, title: "Hit", playedAt: minutesAgo(15) },
    { artist: friend.artist, title: "Shared Taste", playedAt: minutesAgo(5) },
  ]);
  await importListens(hidden.userId, [
    { artist: main, title: "Hit", playedAt: minutesAgo(8) },
    { artist: hidden.artist, title: "Secret", playedAt: minutesAgo(4) },
  ]);
});

after(async () => {
  for (const user of [fan, friend, hidden]) await removeTestUser(user);
  await closeConnections();
});

describe("artist pages", () => {
  it("adds up plays, listeners and songs, private listeners included", async () => {
    const artist = await getArtist(slug(main));
    assert.equal(artist?.name, main);
    assert.equal(artist?.plays, 5);
    assert.equal(artist?.listeners, 3);
    assert.equal(artist?.songs, 2);
  });

  it("returns null for an unknown artist", async () => {
    assert.equal(await getArtist(slug(`${main} Nobody`)), null);
  });

  it("lists the top songs by plays", async () => {
    const songs = await getTopSongs(slug(main));
    assert.deepEqual(
      songs.map((s) => [s.title, s.plays, s.listeners]),
      [
        ["Hit", 4, 3],
        ["Deep Cut", 1, 1],
      ],
    );
  });

  it("shows your own plays of the artist", async () => {
    assert.equal(await getYourArtistPlays(fan.userId, slug(main)), 3);
    assert.equal(await getYourArtistPlays(friend.userId, slug(hidden.artist)), 0);
  });

  it("suggests artists that public listeners also play", async () => {
    const similar = await getSimilarArtists(slug(main));
    assert.deepEqual(
      similar.map((a) => [a.name, a.listeners]),
      [[friend.artist, 2]],
    );
  });

  it("never reveals which artists a private listener plays", async () => {
    const similar = await getSimilarArtists(slug(main));
    assert.equal(
      similar.some((a) => a.name === hidden.artist),
      false,
    );
    assert.deepEqual(await getSimilarArtists(slug(hidden.artist)), []);
  });
});
