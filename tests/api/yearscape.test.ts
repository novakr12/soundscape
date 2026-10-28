import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { importListens } from "../../lib/imports";
import { localDay } from "../../lib/time";
import { getYearscape } from "../../lib/yearscape";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const oldBand = `${user.artist} Old`;
const newBand = `${user.artist} New`;
const thisYear = Number(localDay(new Date()).slice(0, 4));
const year = thisYear - 1;
const utc = (y: number, month: number, day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(y, month - 1, day, hour, minute));

before(async () => {
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist: oldBand, title: "Classic", playedAt: utc(year - 1, 6, 15, 12), durationMs: 200_000 },
    { artist: oldBand, title: "Classic", playedAt: utc(year - 1, 12, 31, 23, 30) },
    { artist: oldBand, title: "Classic", playedAt: utc(year, 3, 10, 11) },
    { artist: oldBand, title: "Classic", playedAt: utc(year, 3, 11, 11) },
    { artist: oldBand, title: "Classic", playedAt: utc(year, 3, 12, 11) },
    { artist: newBand, title: "Fresh", playedAt: utc(year, 3, 12, 15) },
    { artist: newBand, title: "Fresh", playedAt: utc(year, 3, 12, 16) },
    { artist: newBand, title: "Fresh", playedAt: utc(year, 7, 1, 10) },
    { artist: newBand, title: "Late", playedAt: utc(year, 12, 31, 23, 30) },
  ]);
});

after(async () => {
  for (const artist of [oldBand, newBand]) await removeTestUser({ ...user, artist });
  await closeConnections();
});

describe("Yearscape", () => {
  it("counts the year in Belgrade time, including just after midnight on 1 January", async () => {
    const scape = await getYearscape(user.userId, year);
    assert.equal(scape.plays, 7);
    assert.equal(scape.songs, 2);
    assert.equal(scape.artists, 2);
    assert.ok(scape.years.includes(year) && scape.years.includes(year - 1) && scape.years.includes(thisYear));
  });

  it("ranks the top songs and artists", async () => {
    const scape = await getYearscape(user.userId, year);
    assert.deepEqual(
      scape.topSongs.map((s) => [s.title, s.plays]),
      [
        ["Classic", 4],
        ["Fresh", 3],
      ],
    );
    assert.deepEqual(
      scape.topArtists.map((a) => [a.name, a.plays]),
      [
        [oldBand, 4],
        [newBand, 3],
      ],
    );
  });

  it("breaks the year down by month", async () => {
    const scape = await getYearscape(user.userId, year);
    assert.deepEqual(
      scape.months.map((m) => m.plays),
      [1, 0, 5, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    );
    assert.equal(scape.months[2].topSong?.title, "Classic");
    assert.equal(scape.months[6].topArtist?.name, newBand);
    assert.equal(scape.months[1].topSong, undefined);
  });

  it("finds the biggest day and the longest streak", async () => {
    const scape = await getYearscape(user.userId, year);
    assert.deepEqual(scape.busiestDay, { day: `${year}-03-12`, plays: 3 });
    assert.deepEqual(scape.longestStreak, { days: 3, from: `${year}-03-10`, to: `${year}-03-12` });
  });

  it("only counts artists never played before as new", async () => {
    const scape = await getYearscape(user.userId, year);
    assert.deepEqual(scape.newArtists, [{ name: newBand, month: `${year}-03` }]);
    const next = await getYearscape(user.userId, thisYear);
    assert.deepEqual(next.newArtists, []);
  });

  it("adds up listening time, estimating unknown lengths from the average", async () => {
    const scape = await getYearscape(user.userId, year);
    assert.equal(scape.listeningMs, 7 * 200_000);
  });

  it("is empty for a year without plays", async () => {
    const scape = await getYearscape(user.userId, year - 5);
    assert.equal(scape.plays, 0);
    assert.equal(scape.longestStreak, undefined);
    assert.equal(scape.busiestDay, undefined);
  });
});
