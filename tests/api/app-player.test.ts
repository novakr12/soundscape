import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { clearListening } from "../../lib/live";
import { createToken } from "../../lib/tokens";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const user = testUser();
let token = "";

const withToken = (value: string) => ({ authorization: `Token ${value}`, "user-agent": "SoundscapeDesktop/test" });

before(async () => {
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: "Known Song", playedAt: new Date(Date.now() - 86_400_000) },
    { artist: user.artist, title: "Album Song", album: "Some Album", playedAt: new Date(Date.now() - 90_000_000) },
  ]);
  token = await createToken(user.userId, "App player test");
});

after(async () => {
  await clearListening(user.userId);
  await removeTestUser(user);
  await closeConnections();
});

describe("the desktop app's own player", () => {
  it("streams with the app's token instead of a browser login", async () => {
    const anonymous = await fetch(`${BASE_URL}/api/full-song/some-song`);
    assert.equal(anonymous.status, 401);
    const wrong = await fetch(`${BASE_URL}/api/full-song/some-song`, { headers: withToken("not-a-token") });
    assert.equal(wrong.status, 401);
    const signed = await fetch(`${BASE_URL}/api/full-song/some-song`, { headers: withToken(token) });
    assert.equal(signed.status, 404);
    assert.match((await signed.json()).error, /Navidrome/);
    const listen = await fetch(`${BASE_URL}/api/listen/${trackIdFor(user.artist, "Known Song")}`, {
      headers: withToken(token),
      redirect: "manual",
    });
    assert.equal(listen.status, 307);
    const preview = `${BASE_URL}/api/preview/${trackIdFor(user.artist, "Known Song")}`;
    assert.equal((await fetch(preview, { redirect: "manual" })).status, 401);
    assert.notEqual((await fetch(preview, { headers: withToken(token), redirect: "manual" })).status, 401);
  });

  it("tells the app the album and where a cover can be seen without logging in", async () => {
    const anonymous = await fetch(`${BASE_URL}/api/cover-link?artist=a&title=b`);
    assert.equal(anonymous.status, 401);
    const answer = await fetch(
      `${BASE_URL}/api/cover-link?${new URLSearchParams({ artist: user.artist, title: "Known Song" })}`,
      { headers: withToken(token) },
    );
    assert.equal(answer.status, 200);
    assert.deepEqual(await answer.json(), { url: null, album: null });
    const withAlbum = await fetch(
      `${BASE_URL}/api/cover-link?${new URLSearchParams({ artist: user.artist, title: "Album Song" })}`,
      { headers: withToken(token) },
    );
    assert.equal((await withAlbum.json()).album, "Some Album");
  });

  it("counts plays and shares what is playing with the app's token", async () => {
    const trackId = trackIdFor(user.artist, "Known Song");
    const nowPlaying = await fetch(`${BASE_URL}/api/now-playing`, {
      method: "POST",
      headers: { ...withToken(token), "content-type": "application/json" },
      body: JSON.stringify({ trackId }),
    });
    assert.equal(nowPlaying.status, 200);
    const play = await fetch(`${BASE_URL}/api/play`, {
      method: "POST",
      headers: { ...withToken(token), "content-type": "application/json" },
      body: JSON.stringify({ trackId }),
    });
    assert.equal(play.status, 201);
  });
});
