import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startSession } from "../../lib/sessions";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const user = testUser();
let cookie = "";

const radio = (body: unknown, withCookie = true) =>
  fetch(`${BASE_URL}/api/radio`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

before(async () => {
  await createTestUser(user.userId);
  cookie = `soundscape_session=${await startSession(user.userId)}`;
});

after(async () => {
  await removeTestUser(user);
  await closeConnections();
});

describe("radio and playlists", () => {
  it("needs a logged in listener and a song or an artist", async () => {
    assert.equal((await radio({ trackId: "x" }, false)).status, 401);
    assert.equal((await radio({})).status, 400);
    assert.equal((await radio({ trackId: "has spaces" })).status, 400);
  });

  it("asks to connect Navidrome before using playlists", async () => {
    const list = await fetch(`${BASE_URL}/api/music/playlist-songs`, { headers: { cookie } });
    assert.equal(list.status, 409);
    const anonymous = await fetch(`${BASE_URL}/api/music/playlist-songs`);
    assert.equal(anonymous.status, 401);
    const add = await fetch(`${BASE_URL}/api/music/playlist-songs`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ trackId: "some-song", playlistId: "pl-1" }),
    });
    assert.equal(add.status, 409);
    const nothing = await fetch(`${BASE_URL}/api/music/playlist-songs`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ trackId: "some-song" }),
    });
    assert.equal(nothing.status, 400);
  });

  it("asks to connect Navidrome first", async () => {
    const response = await radio({ artistId: "radiohead" });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Navidrome/);
  });
});
