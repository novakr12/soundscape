import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { getHistory, type HistoryEntry } from "../../lib/history";
import { importListens } from "../../lib/imports";
import { getRecent } from "../../lib/live";
import { deletePlay, editPlay } from "../../lib/play-edits";
import { sql } from "../../lib/postgres";
import { monthBucket } from "../../lib/time";
import { awayFromMidnight, chartEntry, closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const { userId, artist } = user;
const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

async function history() {
  return (await getHistory(userId, monthBucket(new Date()))).filter((play) => play.artist.startsWith(artist));
}

async function find(title: string): Promise<HistoryEntry> {
  const play = (await history()).find((p) => p.title === title);
  assert.ok(play, `no play of ${title}`);
  return play;
}

async function listenCount(title: string, artistName = artist) {
  const [row] = await sql`
    SELECT plays FROM user_track_plays WHERE user_id = ${userId} AND track_id = ${trackIdFor(artistName, title)}`;
  return row?.plays ?? 0;
}

async function chartScore(title: string, artistName = artist) {
  return (await chartEntry(trackIdFor(artistName, title)))?.plays ?? 0;
}

before(async () => {
  await awayFromMidnight();
  await createTestUser(userId);
  await importListens(userId, [
    { artist, title: "Kept", playedAt: secondsAgo(30) },
    { artist, title: "Twice", playedAt: secondsAgo(20) },
    { artist, title: "Twice", playedAt: secondsAgo(10) },
    { artist, title: "Typo Sogn", playedAt: secondsAgo(5) },
  ]);
});

after(async () => {
  await removeTestUser(user);
  await removeTestUser({ ...user, artist: `${artist} Fixed` });
  await closeConnections();
});

describe("deletePlay", () => {
  it("removes one play from history, listen counts, charts and recently played", async () => {
    const play = await find("Twice");
    assert.ok(await deletePlay(userId, { playId: play.playId, playedAt: play.playedAt }));

    assert.equal((await history()).filter((p) => p.title === "Twice").length, 1);
    assert.equal(await listenCount("Twice"), 1);
    assert.equal(await chartScore("Twice"), 1);
    const recent = await getRecent(userId);
    assert.equal(recent.filter((r) => r.trackId === play.trackId).length, 1);
    assert.equal(recent.length, 3);
  });

  it("drops the song from the charts and listener count when its last play is deleted", async () => {
    const play = await find("Kept");
    await deletePlay(userId, { playId: play.playId, playedAt: play.playedAt });

    assert.equal(await listenCount("Kept"), 0);
    assert.equal(await chartEntry(play.trackId), null);
  });

  it("does nothing for a play that is not there", async () => {
    const play = await find("Twice");
    assert.equal(await deletePlay(userId, { playId: play.playId, playedAt: secondsAgo(999) }), null);
    assert.equal(await deletePlay(userId, { playId: "not-a-uuid", playedAt: play.playedAt }), null);
    assert.equal(await deletePlay("someone_else", { playId: play.playId, playedAt: play.playedAt }), null);
    assert.equal(await listenCount("Twice"), 1);
  });
});

describe("editPlay", () => {
  it("moves the play to the corrected song at the same time", async () => {
    const play = await find("Typo Sogn");
    const fixedArtist = `${artist} Fixed`;
    const result = await editPlay(userId, { playId: play.playId, playedAt: play.playedAt }, fixedArtist, "Typo Song");
    assert.equal(result?.imported, 1);

    const plays = (await getHistory(userId, monthBucket(new Date()))).filter((p) => p.artist.startsWith(artist));
    assert.equal(
      plays.some((p) => p.title === "Typo Sogn"),
      false,
    );
    const fixed = plays.find((p) => p.title === "Typo Song");
    assert.equal(fixed?.artist, fixedArtist);
    assert.equal(fixed?.playedAt.getTime(), play.playedAt.getTime());

    assert.equal(await listenCount("Typo Sogn"), 0);
    assert.equal(await listenCount("Typo Song", fixedArtist), 1);
    assert.equal(await chartScore("Typo Sogn"), 0);
    assert.equal(await chartScore("Typo Song", fixedArtist), 1);
    assert.equal((await chartEntry(trackIdFor(fixedArtist, "Typo Song")))?.listeners, 1);
  });
});
