import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { importListens } from "../../lib/imports";
import { clearListening, setListening } from "../../lib/live";
import { nowPlaying } from "../../lib/now-playing";
import { setPrivate } from "../../lib/privacy";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const user = testUser();
const image = (username: string, query = "") => fetch(`${BASE_URL}/u/${username}/now-playing.png${query}`);

before(async () => {
  await createTestUser(user.userId);
});

after(async () => {
  await clearListening(user.userId);
  await removeTestUser(user);
  await closeConnections();
});

describe("now playing image", () => {
  it("says nothing was played yet for a new listener", async () => {
    assert.deepEqual(await nowPlaying(user.userId), { state: "nothing" });
  });

  it("shows the last song, then the one playing now", async () => {
    const playedAt = new Date(Date.now() - 3_600_000);
    await importListens(user.userId, [{ artist: user.artist, title: "Earlier", playedAt }]);
    assert.deepEqual(await nowPlaying(user.userId), {
      state: "last",
      title: "Earlier",
      artist: user.artist,
      at: playedAt,
    });
    await setListening(user.userId, { trackId: "x", title: "Right now", artist: user.artist }, 200_000);
    assert.deepEqual(await nowPlaying(user.userId), { state: "now", title: "Right now", artist: user.artist });
  });

  it("never shows what a private listener plays", async () => {
    await setPrivate(user.userId, true);
    assert.deepEqual(await nowPlaying(user.userId), { state: "private" });
    await setPrivate(user.userId, false);
    assert.deepEqual(await nowPlaying("no_such_listener_here"), { state: "missing" });
  });

  it("serves a fresh PNG in both looks", async () => {
    for (const query of ["", "?theme=light"]) {
      const response = await image(user.userId, query);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.match(response.headers.get("cache-control") ?? "", /no-store/);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(1, 4).toString(), "PNG");
      assert.equal(bytes.readUInt32BE(16), 880);
      assert.equal(bytes.readUInt32BE(20), 220);
    }
    assert.equal((await image("no_such_listener_here")).status, 404);
  });
});
