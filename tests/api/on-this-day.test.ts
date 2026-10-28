import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { importListens } from "../../lib/imports";
import { onThisDay } from "../../lib/on-this-day";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const listen = (title: string, playedAt: string) => ({ artist: user.artist, title, playedAt: new Date(playedAt) });

before(async () => {
  await createTestUser(user.userId);
  await importListens(user.userId, [
    listen("Just Before", "2025-05-31T21:50:00Z"),
    listen("Early", "2025-05-31T22:10:00Z"),
    listen("Favourite", "2025-06-01T12:00:00Z"),
    listen("Favourite", "2025-06-01T13:00:00Z"),
    listen("Late", "2025-06-01T21:50:00Z"),
    listen("Just After", "2025-06-01T22:10:00Z"),
    listen("Two Years", "2024-06-01T09:00:00Z"),
    listen("Leap Day", "2024-02-29T12:00:00Z"),
  ]);
});

after(async () => {
  await removeTestUser(user);
  await closeConnections();
});

describe("on this day", () => {
  it("finds the plays from the same local day in earlier years", async () => {
    const days = await onThisDay(user.userId, new Date("2026-06-01T08:00:00Z"));
    assert.deepEqual(
      days.map((day) => [day.year, day.yearsAgo, day.plays]),
      [
        [2025, 1, 4],
        [2024, 2, 1],
      ],
    );
    assert.deepEqual(
      days[0].songs.map((song) => [song.title, song.plays]),
      [
        ["Favourite", 2],
        ["Early", 1],
        ["Late", 1],
      ],
    );
  });

  it("skips years without that date and years without plays", async () => {
    const days = await onThisDay(user.userId, new Date("2028-02-29T12:00:00Z"));
    assert.deepEqual(
      days.map((day) => [day.year, day.songs[0].title]),
      [[2024, "Leap Day"]],
    );
    assert.deepEqual(await onThisDay(user.userId, new Date("2026-01-15T12:00:00Z")), []);
  });
});
