import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getFeed, visibleFollowing } from "../../lib/feed";
import { follow } from "../../lib/follows";
import { importListens } from "../../lib/imports";
import { setPrivate } from "../../lib/privacy";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const me = testUser();
const friend = testUser();
const hidden = testUser();
const stranger = testUser();
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const now = new Date();
const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 2, 12));

before(async () => {
  for (const user of [me, friend, hidden, stranger]) await createTestUser(user.userId);
  await follow(me.userId, friend.userId);
  await follow(me.userId, hidden.userId);
  await setPrivate(hidden.userId, true);
  await importListens(friend.userId, [
    { artist: friend.artist, title: "Last Month", playedAt: lastMonth },
    { artist: friend.artist, title: "Older", playedAt: minutesAgo(30) },
    { artist: friend.artist, title: "Newest", playedAt: minutesAgo(5) },
  ]);
  await importListens(hidden.userId, [{ artist: hidden.artist, title: "Secret", playedAt: minutesAgo(10) }]);
  await importListens(stranger.userId, [{ artist: stranger.artist, title: "Not Followed", playedAt: minutesAgo(1) }]);
});

after(async () => {
  for (const user of [me, friend, hidden, stranger]) await removeTestUser(user);
  await closeConnections();
});

describe("feed", () => {
  it("only includes people you follow who are still public", async () => {
    assert.deepEqual(await visibleFollowing(me.userId), [friend.userId]);
  });

  it("lists their plays newest first, back to last month", async () => {
    const feed = await getFeed(await visibleFollowing(me.userId));
    assert.deepEqual(
      feed.map((item) => [item.userId, item.title]),
      [
        [friend.userId, "Newest"],
        [friend.userId, "Older"],
        [friend.userId, "Last Month"],
      ],
    );
  });

  it("stops at the limit", async () => {
    const feed = await getFeed([friend.userId], 2);
    assert.deepEqual(
      feed.map((item) => item.title),
      ["Newest", "Older"],
    );
  });

  it("is empty when you follow nobody", async () => {
    assert.deepEqual(await getFeed([]), []);
  });
});
