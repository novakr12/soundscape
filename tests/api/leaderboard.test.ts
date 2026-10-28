import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { artistIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { weeklyLeaderboard } from "../../lib/leaderboard";
import { addDays, daysThisWeek, startOfDay } from "../../lib/time";
import { awayFromMidnight, closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const me = testUser();
const friend = testUser();
const quiet = testUser();
const favourite = `${me.artist} Favourite`;
const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

before(async () => {
  await awayFromMidnight();
  for (const user of [me, friend, quiet]) await createTestUser(user.userId);
  const lastWeek = new Date(startOfDay(addDays(daysThisWeek()[0], -7)).getTime() + 3_600_000);
  await importListens(me.userId, [
    { artist: favourite, title: "One", playedAt: secondsAgo(50), durationMs: 120_000 },
    { artist: favourite, title: "Two", playedAt: secondsAgo(40), durationMs: 180_000 },
    { artist: me.artist, title: "Other", playedAt: secondsAgo(30), durationMs: 60_000 },
  ]);
  await importListens(friend.userId, [
    { artist: friend.artist, title: "Only", playedAt: secondsAgo(20), durationMs: 200_000 },
    ...[1, 2, 3, 4].map((n) => ({
      artist: friend.artist,
      title: `Old ${n}`,
      playedAt: new Date(lastWeek.getTime() + n),
    })),
  ]);
});

after(async () => {
  for (const user of [me, friend, quiet]) await removeTestUser(user);
  await removeTestUser({ ...me, artist: favourite });
  await closeConnections();
});

describe("weekly leaderboard", () => {
  it("ranks everyone by plays since Monday with their listening time and top artist", async () => {
    const { rows } = await weeklyLeaderboard([me.userId, friend.userId, quiet.userId]);
    assert.deepEqual(
      rows.map((row) => [row.userId, row.plays, row.listeningMs, row.topArtist?.artistId]),
      [
        [me.userId, 3, 360_000, artistIdFor(favourite)],
        [friend.userId, 1, 200_000, artistIdFor(friend.artist)],
        [quiet.userId, 0, 0, undefined],
      ],
    );
  });

  it("names last week's winner", async () => {
    const { lastWeek } = await weeklyLeaderboard([me.userId, friend.userId]);
    assert.equal(lastWeek?.userId, friend.userId);
    assert.equal(lastWeek?.plays, 4);
  });

  it("leaves out last week when you follow nobody or nobody played", async () => {
    assert.equal((await weeklyLeaderboard([friend.userId])).lastWeek, undefined);
    assert.equal((await weeklyLeaderboard([me.userId, quiet.userId])).lastWeek, undefined);
  });
});
