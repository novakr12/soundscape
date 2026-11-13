import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { deleteAccount } from "../../lib/accounts";
import { trackIdFor } from "../../lib/catalog";
import { follow, followCounts } from "../../lib/follows";
import { getHistory } from "../../lib/history";
import { importListens } from "../../lib/imports";
import { getValue, keys, setValue } from "../../lib/kv";
import { getListening, getRecent, setListening } from "../../lib/live";
import { sql } from "../../lib/postgres";
import { setPrivate } from "../../lib/privacy";
import { sessionUser, startSession } from "../../lib/sessions";
import { monthBucket } from "../../lib/time";
import { createToken, userForAuthorization } from "../../lib/tokens";
import { createUser, userExists } from "../../lib/users";
import { addWanted } from "../../lib/wanted";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const friend = testUser();
let token: string;
let session: string;

before(async () => {
  await createTestUser(user.userId);
  await createTestUser(friend.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: "Leaving", playedAt: new Date(Date.now() - 60_000) },
    { artist: user.artist, title: "Leaving", playedAt: new Date(Date.now() - 120_000) },
  ]);
  token = await createToken(user.userId, "Test");
  session = await startSession(user.userId);
  await setPrivate(user.userId, true);
  await addWanted(user.userId, trackIdFor(user.artist, "Leaving"));
  await follow(user.userId, friend.userId);
  await follow(friend.userId, user.userId);
  await setListening(user.userId, { trackId: "x", title: "X", artist: "Y" });
  await setValue(keys.lastfmProgress(user.userId), {}, 60);
});

after(async () => {
  await removeTestUser(user);
  await removeTestUser(friend);
  await closeConnections();
});

describe("deleteAccount", () => {
  it("removes the account with its plays, token, settings and follows", async () => {
    assert.equal(await deleteAccount(user.userId), 2);
    assert.equal(await userExists(user.userId), false);
    assert.deepEqual(await getHistory(user.userId, monthBucket(new Date())), []);
    assert.deepEqual(await getRecent(user.userId), []);
    assert.equal(await userForAuthorization(`Token ${token}`), null);
    for (const table of ["wanted", "api_tokens", "user_track_plays", "plays", "follows"]) {
      const column = table === "follows" ? "follower" : "user_id";
      const [{ count }] = await sql`SELECT count(*) FROM ${sql(table)} WHERE ${sql(column)} = ${user.userId}`;
      assert.equal(count, 0, table);
    }
    assert.deepEqual(await followCounts(friend.userId), { followers: 0, following: 0 });
    assert.equal(await getListening(user.userId), null);
    assert.equal(await getValue(keys.lastfmProgress(user.userId)), null);
    assert.equal(await sessionUser(session), null);
  });

  it("does not let old logins into a new account with the same name", async () => {
    const old = await startSession(friend.userId);
    await deleteAccount(friend.userId);
    assert.equal(await createUser(friend.userId, "another-password"), true);
    assert.equal(await sessionUser(old), null);
  });

  it("leaves other accounts alone", async () => {
    assert.equal(await userExists(friend.userId), true);
  });
});
