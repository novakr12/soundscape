import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { sql } from "../../lib/postgres";
import { getListeningHeatmap, getListeningTime } from "../../lib/stats";
import { localWeekdayHour } from "../../lib/time";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const { userId, artist } = user;
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

before(async () => {
  await createTestUser(userId);
  await importListens(userId, [
    { artist, title: "Known", playedAt: ago(60 * 24 * 40), durationMs: 200_000 },
    { artist, title: "Known", playedAt: ago(30), durationMs: 200_000 },
    { artist, title: "Known", playedAt: ago(20) },
    { artist, title: "Unknown", playedAt: ago(10) },
  ]);
});

const heatmapUser = testUser();
const now = new Date();
const thirteenMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, 15, 12));
const heatmapPlays = [ago(60 * 24 * 3), ago(60 * 24 * 3 + 5), ago(60 * 24 * 10), ago(60 * 24 * 200)];

before(async () => {
  await createTestUser(heatmapUser.userId);
  await importListens(heatmapUser.userId, [
    ...heatmapPlays.map((playedAt) => ({ artist: heatmapUser.artist, title: "Any Song", playedAt })),
    { artist: heatmapUser.artist, title: "Too Old", playedAt: thirteenMonthsAgo },
  ]);
});

after(async () => {
  await removeTestUser(heatmapUser);
  await removeTestUser(user);
  await closeConnections();
});

describe("listening time", () => {
  it("adds up song lengths and estimates unknown ones from the average", async () => {
    const time = await getListeningTime(userId);
    assert.deepEqual(time.recent, { ms: 600_000, knownShare: 2 / 3 });
    assert.deepEqual(time.allTime, { ms: 800_000, knownShare: 3 / 4 });
  });

  it("keeps the first length a song was given", async () => {
    await importListens(userId, [{ artist, title: "Known", playedAt: ago(5), durationMs: 999_000 }]);
    const [row] = await sql`SELECT duration_ms FROM tracks WHERE id = ${trackIdFor(artist, "Known")}`;
    assert.equal(row.duration_ms, 200_000);
  });

  it("is zero for someone who has not played anything", async () => {
    assert.deepEqual(await getListeningTime(`${userId}_nobody`), {
      recent: { ms: 0, knownShare: 1 },
      allTime: { ms: 0, knownShare: 1 },
    });
  });
});

describe("listening heatmap", () => {
  it("counts the past 12 months of plays by local weekday and hour", async () => {
    const grid = await getListeningHeatmap(heatmapUser.userId);
    assert.equal(grid.length, 7);
    assert.ok(grid.every((row) => row.length === 24));

    const expected = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const playedAt of heatmapPlays) {
      const { weekday, hour } = localWeekdayHour(playedAt);
      expected[weekday][hour]++;
    }
    assert.deepEqual(grid, expected);
    assert.equal(
      grid.flat().reduce((sum, plays) => sum + plays, 0),
      heatmapPlays.length,
    );
  });
});
