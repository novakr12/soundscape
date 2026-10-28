import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { follow, followCounts, isFollowing, listFollowers, listFollowing, unfollow } from "../../lib/follows";
import { setPrivate } from "../../lib/privacy";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const fan = testUser();
const star = testUser();
const hidden = testUser();

before(async () => {
  for (const user of [fan, star, hidden]) await createTestUser(user.userId);
  await setPrivate(hidden.userId, true);
});

after(async () => {
  for (const user of [fan, star, hidden]) await removeTestUser(user);
  await closeConnections();
});

describe("following", () => {
  it("starts with nobody followed, even before a user has played anything", async () => {
    assert.deepEqual(await followCounts(star.userId), { followers: 0, following: 0 });
    assert.equal(await isFollowing(fan.userId, star.userId), false);
  });

  it("follows a public user once, however often you click", async () => {
    assert.equal(await follow(fan.userId, star.userId), null);
    assert.equal(await follow(fan.userId, star.userId), null);
    assert.equal(await isFollowing(fan.userId, star.userId), true);
    assert.deepEqual(await followCounts(star.userId), { followers: 1, following: 0 });
    assert.deepEqual(await followCounts(fan.userId), { followers: 0, following: 1 });
  });

  it("refuses yourself, unknown users and private profiles", async () => {
    assert.match((await follow(fan.userId, fan.userId)) ?? "", /yourself/);
    assert.match((await follow(fan.userId, `${fan.userId}_nobody`)) ?? "", /doesn't exist/);
    assert.match((await follow(fan.userId, hidden.userId)) ?? "", /private/);
    assert.equal(await isFollowing(fan.userId, hidden.userId), false);
  });

  it("lets a private user follow others and lists the newest followers first", async () => {
    assert.equal(await follow(hidden.userId, star.userId), null);
    assert.deepEqual(await listFollowers(star.userId), [hidden.userId, fan.userId]);
    assert.deepEqual(await listFollowing(hidden.userId), [star.userId]);
  });

  it("unfollows", async () => {
    await unfollow(fan.userId, star.userId);
    await unfollow(fan.userId, star.userId);
    assert.equal(await isFollowing(fan.userId, star.userId), false);
    assert.deepEqual(await listFollowers(star.userId), [hidden.userId]);
    assert.deepEqual(await followCounts(fan.userId), { followers: 0, following: 0 });
  });
});
