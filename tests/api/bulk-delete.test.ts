import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { getHistory } from "../../lib/history";
import { importListens } from "../../lib/imports";
import { getRecent } from "../../lib/live";
import { deleteAllPlays, deletePlays } from "../../lib/play-edits";
import { sql } from "../../lib/postgres";
import { monthBucket } from "../../lib/time";
import { awayFromMidnight, chartEntry, closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const other = testUser();
const { userId, artist } = user;
const shared = trackIdFor(artist, "Shared");
const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);
const lastMonth = new Date(Date.now() - 40 * 86_400_000);

async function plays(id = userId) {
  const months = [monthBucket(new Date()), monthBucket(lastMonth)];
  return (await Promise.all(months.map((month) => getHistory(id, month)))).flat();
}

async function listened(id = userId) {
  const [{ total }] = await sql`SELECT coalesce(sum(plays), 0) AS total FROM user_track_plays WHERE user_id = ${id}`;
  return total;
}

before(async () => {
  await awayFromMidnight();
  await createTestUser(userId);
  await createTestUser(other.userId);
  await importListens(userId, [
    { artist, title: "Shared", playedAt: secondsAgo(30) },
    { artist, title: "One", playedAt: secondsAgo(20) },
    { artist, title: "Two", playedAt: secondsAgo(10) },
    { artist, title: "Three", playedAt: secondsAgo(5) },
    { artist, title: "Old", playedAt: lastMonth },
    { artist, title: "Old", playedAt: new Date(lastMonth.getTime() + 60_000) },
  ]);
  await importListens(other.userId, [{ artist, title: "Shared", playedAt: secondsAgo(15) }]);
  await sql`
    INSERT INTO import_state (user_id, source, external_user, listened_up_to)
    VALUES (${userId}, 'listenbrainz', 'someone', now())`;
});

after(async () => {
  await removeTestUser(user);
  await removeTestUser({ ...other, artist });
  await closeConnections();
});

describe("deleting several plays", () => {
  it("deletes the selected plays and leaves the rest", async () => {
    const chosen = (await plays()).filter((play) => play.title === "One" || play.title === "Two");
    const missing = { playId: randomUUID(), playedAt: new Date() };
    const keys = chosen.map(({ playId, playedAt }) => ({ playId, playedAt }));
    const deleted = await deletePlays(userId, [...keys, missing]);
    assert.equal(deleted, 2);
    assert.deepEqual((await plays()).map((play) => play.title).sort(), ["Old", "Old", "Shared", "Three"]);
    assert.equal(await listened(), 4);
  });
});

describe("deleting all plays", () => {
  it("removes every play in every month and reports how many", async () => {
    assert.equal(await deleteAllPlays(userId), 4);
    assert.deepEqual(await plays(), []);
    assert.equal(await listened(), 0);
    assert.deepEqual(await getRecent(userId), []);
    const rows = await sql`SELECT user_id FROM plays WHERE track_id = ${shared}`;
    assert.deepEqual(
      rows.map((row) => row.user_id),
      [other.userId],
    );
  });

  it("only takes this user's plays out of the charts and listener counts", async () => {
    assert.deepEqual(await chartEntry(shared), { plays: 1, listeners: 1 });
    assert.equal(await chartEntry(trackIdFor(artist, "Three")), null);
    assert.equal((await plays(other.userId)).length, 1);
    assert.equal(await listened(other.userId), 1);
  });

  it("lets a ListenBrainz import start over", async () => {
    assert.deepEqual([...(await sql`SELECT * FROM import_state WHERE user_id = ${userId}`)], []);
  });

  it("does nothing for a user without plays", async () => {
    assert.equal(await deleteAllPlays(userId), 0);
  });
});
