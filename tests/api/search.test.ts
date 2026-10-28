import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { slug } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { setPrivate } from "../../lib/privacy";
import { searchArtists, searchSongs, searchUsers } from "../../lib/search";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const fan = testUser();
const hidden = testUser();
const artist = fan.artist;
const other = `${artist} Tribute`;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

before(async () => {
  await createTestUser(fan.userId);
  await createTestUser(hidden.userId);
  await setPrivate(hidden.userId, true);
  await importListens(fan.userId, [
    { artist, title: `Zebra Crossing ${fan.run}`, playedAt: minutesAgo(30) },
    { artist, title: `Zebra Crossing ${fan.run}`, playedAt: minutesAgo(25) },
    { artist: other, title: `Zebra Crossing ${fan.run}`, playedAt: minutesAgo(20) },
    { artist, title: `Café Ünique ${fan.run}`, playedAt: minutesAgo(10) },
  ]);
});

after(async () => {
  await removeTestUser(fan);
  await removeTestUser({ ...fan, artist: other });
  await removeTestUser(hidden);
  await closeConnections();
});

describe("search", () => {
  it("finds songs by the start of a word", async () => {
    const songs = await searchSongs(`zebr ${fan.run}`);
    assert.ok(songs.some((s) => s.title === `Zebra Crossing ${fan.run}`));
  });

  it("finds songs whatever the word order", async () => {
    const songs = await searchSongs(`${fan.run} crossing zebra`);
    assert.ok(songs.some((s) => s.title === `Zebra Crossing ${fan.run}`));
  });

  it("ignores accents", async () => {
    const songs = await searchSongs(`cafe unique ${fan.run}`);
    assert.equal(songs[0]?.title, `Café Ünique ${fan.run}`);
  });

  it("puts the song by a matching artist first", async () => {
    const songs = await searchSongs(`${other} zebra`);
    assert.equal(songs[0]?.artist, other);
    const plain = await searchSongs(`zebra crossing ${fan.run}`);
    assert.equal(plain[0]?.artist, artist);
    assert.equal(plain[0]?.plays, 2);
  });

  it("finds artists with their listeners and plays", async () => {
    const artists = await searchArtists(fan.run);
    const found = artists.find((a) => a.artistId === slug(artist));
    assert.equal(found?.name, artist);
    assert.equal(found?.plays, 3);
    assert.equal(found?.listeners, 1);
  });

  it("copes with special characters", async () => {
    for (const text of ["zebra (", '"', "a:b", "*", "\\", "-", "AND OR NOT"]) {
      await assert.doesNotReject(searchSongs(text), `failed on ${text}`);
      await assert.doesNotReject(searchArtists(text), `failed on ${text}`);
    }
    assert.deepEqual(await searchSongs("   "), []);
  });

  it("finds public users and hides private ones from everyone else", async () => {
    assert.deepEqual(await searchUsers(fan.run, null), [fan.userId]);
    assert.deepEqual(await searchUsers(hidden.run, null), []);
    assert.deepEqual(await searchUsers(hidden.run, hidden.userId), [hidden.userId]);
    assert.deepEqual(await searchUsers("x", null), []);
  });
});
