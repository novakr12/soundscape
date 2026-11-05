import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { follow, unfollow } from "../../lib/follows";
import { importListens } from "../../lib/imports";
import {
  checkLeaderboardPasses,
  checkMilestones,
  listNotifications,
  markAllRead,
  removeOldNotifications,
  unreadCount,
} from "../../lib/notifications";
import { sql } from "../../lib/postgres";
import { setPrivate } from "../../lib/privacy";
import { awayFromMidnight, closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const me = testUser();
const friend = testUser();
const veteran = testUser();
const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);
const plays = (user: ReturnType<typeof testUser>, count: number, from: number) =>
  Array.from({ length: count }, (_, n) => ({
    artist: user.artist,
    title: `Song ${from + n}`,
    playedAt: secondsAgo(600 - from - n),
  }));

before(async () => {
  await awayFromMidnight(10 * 60_000);
  for (const user of [me, friend, veteran]) await createTestUser(user.userId);
});

after(async () => {
  for (const user of [me, friend, veteran]) await removeTestUser(user);
  await closeConnections();
});

describe("notifications", () => {
  it("tells people about new followers once, however often they are followed", async () => {
    assert.equal(await follow(friend.userId, me.userId), null);
    await unfollow(friend.userId, me.userId);
    await follow(friend.userId, me.userId);
    assert.equal(await follow(me.userId, me.userId), "You can't follow yourself.");
    const list = await listNotifications(me.userId);
    assert.deepEqual(
      list.map((n) => [n.kind, n.otherUser, n.read]),
      [["follow", friend.userId, false]],
    );
    assert.equal(await unreadCount(me.userId), 1);
    await markAllRead(me.userId);
    assert.equal(await unreadCount(me.userId), 0);
    assert.equal((await listNotifications(me.userId))[0].read, true);
  });

  it("celebrates play milestones, but only quietly records old ones the first time", async () => {
    await importListens(me.userId, plays(me, 1, 0));
    await importListens(veteran.userId, plays(veteran, 120, 0));
    await checkMilestones([me.userId, veteran.userId]);
    assert.deepEqual(
      (await listNotifications(me.userId)).filter((n) => n.kind === "milestone").map((n) => [n.count, n.read]),
      [[1, false]],
    );
    assert.deepEqual(
      (await listNotifications(veteran.userId)).map((n) => [n.kind, n.count, n.read]),
      [["milestone", 100, false]],
    );

    await importListens(me.userId, plays(me, 99, 1));
    await checkMilestones([me.userId]);
    await checkMilestones([me.userId]);
    assert.deepEqual(
      (await listNotifications(me.userId)).filter((n) => n.kind === "milestone").map((n) => n.count),
      [100, 1],
    );
  });

  it("tells you when someone you follow passes you on the weekly leaderboard", async () => {
    await follow(me.userId, friend.userId);
    await importListens(friend.userId, plays(friend, 50, 0));
    await checkLeaderboardPasses([me.userId]);
    assert.equal((await listNotifications(me.userId)).filter((n) => n.kind === "passed").length, 0);

    await importListens(friend.userId, plays(friend, 60, 50));
    await checkLeaderboardPasses([me.userId]);
    await checkLeaderboardPasses([me.userId]);
    const passed = (await listNotifications(me.userId)).filter((n) => n.kind === "passed");
    assert.deepEqual(
      passed.map((n) => [n.otherUser, n.read]),
      [[friend.userId, false]],
    );

    await setPrivate(friend.userId, true);
    assert.equal((await listNotifications(me.userId)).filter((n) => n.kind === "passed").length, 0);
    await setPrivate(friend.userId, false);
  });

  it("forgets notifications after 90 days", async () => {
    await sql`UPDATE notifications SET created_at = now() - interval '91 days' WHERE user_id = ${veteran.userId}`;
    await removeOldNotifications();
    assert.equal((await listNotifications(veteran.userId)).length, 0);
  });
});
