import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { importListens } from "../../lib/imports";
import { deleteValues, getValue, keys } from "../../lib/kv";
import { computeListeningRecord, getListeningRecord } from "../../lib/milestones";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const empty = testUser();
const { artist } = user;
const now = new Date("2026-06-10T12:00:00Z");
const at = (day: string, minute = 0) => new Date(Date.parse(`${day}T10:00:00Z`) + minute * 60_000);

before(async () => {
  await createTestUser(user.userId);
  await createTestUser(empty.userId);
  await importListens(user.userId, [
    { artist, title: "First Ever", playedAt: at("2026-05-01") },
    { artist, title: "Day Two", playedAt: at("2026-05-02") },
    ...Array.from({ length: 97 }, (_, i) => ({ artist, title: `Busy ${i}`, playedAt: at("2026-05-03", i + 1) })),
    { artist, title: "Hundredth", playedAt: at("2026-05-04") },
    { artist, title: "Day Five", playedAt: at("2026-05-05") },
    { artist, title: "Again", playedAt: at("2026-06-07") },
    { artist, title: "Again", playedAt: at("2026-06-08") },
    { artist, title: "Again", playedAt: at("2026-06-09") },
  ]);
});

after(async () => {
  await removeTestUser(user);
  await removeTestUser(empty);
  await closeConnections();
});

describe("streaks and milestones", () => {
  it("counts the current and the longest streak in local days", async () => {
    const record = await computeListeningRecord(user.userId, now);
    assert.equal(record.plays, 104);
    assert.equal(record.currentStreak, 3);
    assert.equal(record.playedToday, false);
    assert.deepEqual(record.longestStreak, { days: 5, from: "2026-05-01", to: "2026-05-05" });
    assert.equal((await computeListeningRecord(user.userId, new Date("2026-06-12T12:00:00Z"))).currentStreak, 0);
  });

  it("remembers the first and the hundredth play and the next milestone", async () => {
    const record = await computeListeningRecord(user.userId, now);
    assert.deepEqual(
      record.milestones.map((m) => [m.count, m.title, m.playedAt]),
      [
        [1, "First Ever", "2026-05-01T10:00:00.000Z"],
        [100, "Hundredth", "2026-05-04T10:00:00.000Z"],
      ],
    );
    assert.equal(record.nextMilestone, 500);
  });

  it("is empty for someone without plays", async () => {
    const record = await computeListeningRecord(empty.userId, now);
    assert.deepEqual([record.plays, record.currentStreak, record.longestStreak, record.milestones], [0, 0, null, []]);
  });

  it("forgets the cached record when new plays come in", async () => {
    const before = await getListeningRecord(user.userId);
    assert.notEqual(await getValue(keys.listeningRecord(user.userId)), null);
    await importListens(user.userId, [{ artist, title: "Newest", playedAt: new Date(Date.now() - 60_000) }]);
    assert.equal(await getValue(keys.listeningRecord(user.userId)), null);
    assert.equal((await getListeningRecord(user.userId)).plays, before.plays + 1);
    await deleteValues(keys.listeningRecord(user.userId));
  });
});
