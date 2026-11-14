import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { follow } from "../../lib/follows";
import { importListens } from "../../lib/imports";
import { clearListening, setListening } from "../../lib/live";
import { setPrivate } from "../../lib/privacy";
import { addDays, daysThisWeek, startOfDay } from "../../lib/time";
import { createToken } from "../../lib/tokens";
import { awayFromMidnight, closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const me = testUser();
const friend = testUser();
const stranger = testUser();
const users = [me, friend, stranger];
let token = "";

const api = (path: string, auth = true) =>
  fetch(`${BASE_URL}${path}`, auth ? { headers: { authorization: `Token ${token}` } } : {});

before(async () => {
  await awayFromMidnight();
  for (const user of users) await createTestUser(user.userId);
  token = await createToken(me.userId, "Desktop extras test");
  assert.equal(await follow(me.userId, friend.userId), null);
  const lastWeek = new Date(startOfDay(addDays(daysThisWeek()[0], -7)).getTime() + 3 * 3_600_000);
  await importListens(
    me.userId,
    [1, 2, 3].map((n) => ({
      artist: me.artist,
      title: `Weekly ${n % 2}`,
      playedAt: new Date(lastWeek.getTime() + n * 60_000),
    })),
  );
  await importListens(friend.userId, [{ artist: friend.artist, title: "Friend song", playedAt: lastWeek }]);
});

after(async () => {
  for (const user of users) await clearListening(user.userId);
  for (const user of users) await removeTestUser(user);
  await closeConnections();
});

describe("more for the desktop app", () => {
  it("refuses requests without a token", async () => {
    for (const path of ["/api/friends/listening", "/api/recap/week", "/api/search?q=test"]) {
      assert.equal((await api(path, false)).status, 401, path);
    }
  });

  it("shows what the people you follow are playing, and only them", async () => {
    await setListening(friend.userId, { trackId: "x", title: "Live Song", artist: friend.artist }, 200_000);
    await setListening(stranger.userId, { trackId: "y", title: "Stranger Song", artist: stranger.artist }, 200_000);
    const body = await (await api("/api/friends/listening")).json();
    assert.deepEqual(
      body.listening.map((now: { user: string; title: string; url: string }) => [now.user, now.title, now.url]),
      [[friend.userId, "Live Song", `/u/${friend.userId}`]],
    );
    await setPrivate(friend.userId, true);
    assert.deepEqual((await (await api("/api/friends/listening")).json()).listening, []);
    await setPrivate(friend.userId, false);
  });

  it("gives last week's recap", async () => {
    const { recap, url, show } = await (await api("/api/recap/week")).json();
    assert.equal(url, "/");
    assert.equal(typeof show, "boolean");
    assert.equal(recap.plays, 3);
    assert.equal(recap.topSong.title, "Weekly 1");
    assert.equal(recap.topArtist.name, me.artist);
    assert.deepEqual(recap.place, { rank: 1, of: 2 });
  });

  it("searches artists and songs with links to their pages", async () => {
    const body = await (await api(`/api/search?q=${encodeURIComponent(me.artist)}`)).json();
    const artist = body.artists.find((found: { name: string }) => found.name === me.artist);
    assert.ok(artist);
    assert.match(artist.url, /^\/artist\//);
    const songs = await (await api(`/api/search?q=${encodeURIComponent(`Weekly ${me.artist}`)}`)).json();
    assert.ok(
      songs.songs.some(
        (song: { artist: string; url: string }) => song.artist === me.artist && song.url.startsWith("/track/"),
      ),
    );
    assert.deepEqual(await (await api("/api/search?q=x")).json(), { artists: [], songs: [] });
  });
});
