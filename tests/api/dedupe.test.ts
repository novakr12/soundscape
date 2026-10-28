import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { findDuplicatePlays, removeDuplicatePlays, withoutKnownPlays } from "../../lib/dedupe";
import { getHistory } from "../../lib/history";
import { importListens } from "../../lib/imports";
import { sql } from "../../lib/postgres";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const other = testUser();
const { artist } = user;
const at = (iso: string) => new Date(iso);
const listen = (title: string, playedAt: string) => ({ artist, title, playedAt: at(playedAt) });

async function listened(title: string) {
  const [row] = await sql`
    SELECT plays FROM user_track_plays WHERE user_id = ${user.userId} AND track_id = ${trackIdFor(artist, title)}`;
  return row?.plays ?? 0;
}

before(async () => {
  await createTestUser(user.userId);
  await createTestUser(other.userId);
  await importListens(user.userId, [
    listen("Song", "2025-08-14T10:00:00Z"),
    listen("Song", "2025-08-14T10:00:30Z"),
    listen("Song", "2025-08-14T10:00:50Z"),
    listen("Song", "2025-08-14T10:01:30Z"),
    listen("Song", "2025-08-14T10:05:00Z"),
    listen("Other Song", "2025-08-14T10:00:30Z"),
    listen("Twice", "2025-08-20T12:00:00Z"),
    listen("Twice", "2025-08-20T12:00:00Z"),
    listen("Midnight", "2025-08-31T23:59:40Z"),
    listen("Midnight", "2025-09-01T00:00:10Z"),
  ]);
  await importListens(other.userId, [listen("Song", "2025-08-14T10:00:30Z")]);
});

after(async () => {
  await removeTestUser(user);
  await removeTestUser({ ...other, artist });
  await closeConnections();
});

describe("duplicate plays", () => {
  it("finds plays of the same song within a minute of the one that stays", async () => {
    const duplicates = await findDuplicatePlays(user.userId);
    assert.deepEqual(
      duplicates.map((d) => [d.title, d.playedAt.toISOString(), d.keptAt.toISOString()]),
      [
        ["Song", "2025-08-14T10:00:30.000Z", "2025-08-14T10:00:00.000Z"],
        ["Song", "2025-08-14T10:00:50.000Z", "2025-08-14T10:00:00.000Z"],
        ["Twice", "2025-08-20T12:00:00.000Z", "2025-08-20T12:00:00.000Z"],
        ["Midnight", "2025-09-01T00:00:10.000Z", "2025-08-31T23:59:40.000Z"],
      ],
    );
    assert.deepEqual(await findDuplicatePlays(other.userId), []);
  });

  it("skips new plays you already have or that repeat each other", async () => {
    const fresh = await withoutKnownPlays(user.userId, [
      listen("Song", "2025-08-14T10:00:20Z"),
      listen("New", "2025-08-14T11:00:00Z"),
      listen("New", "2025-08-14T11:00:40Z"),
      listen("New", "2025-08-14T11:02:00Z"),
    ]);
    assert.deepEqual(
      fresh.map((play) => [play.title, play.playedAt.toISOString()]),
      [
        ["New", "2025-08-14T11:00:00.000Z"],
        ["New", "2025-08-14T11:02:00.000Z"],
      ],
    );
  });

  it("removes them from history and play counts and leaves the rest", async () => {
    const duplicates = await findDuplicatePlays(user.userId);
    assert.equal(await removeDuplicatePlays(user.userId, duplicates), 4);
    assert.deepEqual(await findDuplicatePlays(user.userId), []);
    const history = [...(await getHistory(user.userId, "2025-08")), ...(await getHistory(user.userId, "2025-09"))];
    assert.deepEqual(history.map((play) => play.title).sort(), [
      "Midnight",
      "Other Song",
      "Song",
      "Song",
      "Song",
      "Twice",
    ]);
    assert.equal(await listened("Song"), 3);
    assert.equal(await listened("Twice"), 1);
    assert.equal(await listened("Midnight"), 1);
    assert.equal((await getHistory(other.userId, "2025-08")).length, 1);
  });
});
