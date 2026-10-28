import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { sql } from "../../lib/postgres";
import { getMonthscape } from "../../lib/yearscape";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const other = `${user.artist} Other`;
const now = new Date("2026-10-25T12:00:00Z");
const listen = (artist: string, title: string, playedAt: string) => ({ artist, title, playedAt: new Date(playedAt) });

before(async () => {
  await createTestUser(user.userId);
  await importListens(user.userId, [
    listen(user.artist, "July Song", "2025-07-31T21:30:00Z"),
    listen(user.artist, "Midnight", "2025-07-31T22:30:00Z"),
    listen(user.artist, "Midnight", "2025-08-14T18:00:00Z"),
    listen(other, "Fresh", "2025-08-15T18:00:00Z"),
    listen(user.artist, "Last Day", "2025-08-31T21:30:00Z"),
    listen(user.artist, "September", "2025-08-31T22:30:00Z"),
  ]);
  await sql`UPDATE tracks SET cover = 'https://example.com/midnight.jpg' WHERE id = ${trackIdFor(user.artist, "Midnight")}`;
  await sql`UPDATE tracks SET cover = 'https://example.com/last-day.jpg' WHERE id = ${trackIdFor(user.artist, "Last Day")}`;
});

after(async () => {
  await removeTestUser(user);
  await removeTestUser({ ...user, artist: other });
  await closeConnections();
});

describe("monthly recap", () => {
  it("counts the month in Belgrade time", async () => {
    const scape = await getMonthscape(user.userId, "2025-08", now);
    assert.equal(scape.plays, 4);
    assert.equal(scape.days.length, 31);
    assert.deepEqual(
      scape.days.filter((day) => day.plays > 0).map((day) => [day.day, day.plays]),
      [
        ["2025-08-01", 1],
        ["2025-08-14", 1],
        ["2025-08-15", 1],
        ["2025-08-31", 1],
      ],
    );
    assert.deepEqual(scape.topSongs[0].title, "Midnight");
    assert.equal(scape.topSongs[0].plays, 2);
  });

  it("only counts artists first heard that month as new", async () => {
    const scape = await getMonthscape(user.userId, "2025-08", now);
    assert.deepEqual(scape.newArtists, [{ name: other, month: "2025-08" }]);
    const july = await getMonthscape(user.userId, "2025-07", now);
    assert.deepEqual(
      july.newArtists.map((artist) => artist.name),
      [user.artist],
    );
  });

  it("shows each artist with the cover of their most played song", async () => {
    const scape = await getMonthscape(user.userId, "2025-08", now);
    assert.deepEqual(
      scape.topArtists.map((artist) => [artist.name, artist.cover]),
      [
        [user.artist, "https://example.com/midnight.jpg"],
        [other, undefined],
      ],
    );
  });

  it("links to the months around it", async () => {
    const august = await getMonthscape(user.userId, "2025-08", now);
    assert.equal(august.previous, "2025-07");
    assert.equal(august.next, "2025-09");
    const july = await getMonthscape(user.userId, "2025-07", now);
    assert.equal(july.previous, undefined);
    const current = await getMonthscape(user.userId, "2026-10", now);
    assert.equal(current.next, undefined);
    assert.equal(current.plays, 0);
  });
});
