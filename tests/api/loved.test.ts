import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { isLoved, lovedSongs, setLoved } from "../../lib/loved";
import { createToken } from "../../lib/tokens";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const me = testUser();
let token = "";

const love = (body: unknown, auth = true) =>
  fetch(`${BASE_URL}/api/love`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Token ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const loved = async (artist: string, title: string) => {
  const query = new URLSearchParams({ artist, title });
  const response = await fetch(`${BASE_URL}/api/love?${query}`, { headers: { authorization: `Token ${token}` } });
  return ((await response.json()) as { loved: boolean }).loved;
};

before(async () => {
  await createTestUser(me.userId);
  token = await createToken(me.userId, "Loved songs test");
  await importListens(me.userId, [
    { artist: me.artist, title: "Played Song", playedAt: new Date(Date.now() - 3_600_000) },
  ]);
});

after(async () => {
  await removeTestUser(me);
  await closeConnections();
});

describe("Loved songs", () => {
  it("needs a token and both names", async () => {
    assert.equal((await love({ artist: me.artist, title: "Played Song", loved: true }, false)).status, 401);
    assert.equal((await love({ artist: me.artist, loved: true })).status, 400);
    assert.equal((await love({ artist: " ", title: "x", loved: true })).status, 400);
    assert.equal((await love({ artist: me.artist, title: "Played Song", loved: "yes" })).status, 400);
  });

  it("loves and unloves a song from the desktop app", async () => {
    assert.equal(await loved(me.artist, "Played Song"), false);
    const response = await love({ artist: me.artist, title: "Played Song", loved: true });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { url: string };
    assert.equal(body.url, `/track/${encodeURIComponent(trackIdFor(me.artist, "Played Song"))}`);
    assert.equal(await loved(me.artist, "Played Song"), true);
    assert.equal(await loved(me.artist.toUpperCase(), "played song"), true);

    await love({ artist: me.artist, title: "Played Song", loved: false });
    assert.equal(await loved(me.artist, "Played Song"), false);
  });

  it("can love a song that's only playing right now and hasn't been scrobbled yet", async () => {
    assert.equal(await loved(me.artist, "Brand New Song"), false);
    assert.equal((await love({ artist: me.artist, title: "Brand New Song", loved: true })).status, 200);
    assert.equal(await loved(me.artist, "Brand New Song"), true);
    assert.deepEqual(
      (await lovedSongs(me.userId)).map((song) => song.title),
      ["Brand New Song"],
    );
  });

  it("loves songs from the website by id", async () => {
    const trackId = trackIdFor(me.artist, "Played Song");
    assert.equal(await setLoved(me.userId, trackId, true), true);
    assert.equal(await isLoved(me.userId, trackId), true);
    assert.equal((await lovedSongs(me.userId))[0].title, "Played Song");
    assert.equal(await setLoved(me.userId, "no-such-track", true), false);
    assert.equal(await setLoved(me.userId, trackId, false), true);
    assert.equal(await isLoved(me.userId, trackId), false);
  });
});
