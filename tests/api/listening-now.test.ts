import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { clearListening, getListening } from "../../lib/live";
import { startSession } from "../../lib/sessions";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const user = testUser();
let cookie = "";

const announce = (body: unknown, withCookie = true) =>
  fetch(`${BASE_URL}/api/now-playing`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

before(async () => {
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: "Known Song", playedAt: new Date(Date.now() - 86_400_000) },
  ]);
  cookie = `soundscape_session=${await startSession(user.userId)}`;
});

after(async () => {
  await clearListening(user.userId);
  await removeTestUser(user);
  await closeConnections();
});

describe("now playing from the Soundscape player", () => {
  it("needs a logged in listener and a song", async () => {
    assert.equal((await announce({ trackId: "x" }, false)).status, 401);
    assert.equal((await announce({})).status, 400);
    assert.equal((await announce({ trackId: "no-such-song" })).status, 404);
  });

  it("shows the song as playing now on the profile", async () => {
    const trackId = trackIdFor(user.artist, "Known Song");
    assert.equal((await announce({ trackId })).status, 200);
    const listening = await getListening(user.userId);
    assert.equal(listening?.trackId, trackId);
    assert.equal(listening?.title, "Known Song");
    assert.equal(listening?.artist, user.artist);
  });
});
