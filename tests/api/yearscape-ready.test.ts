import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { importListens } from "../../lib/imports";
import { createToken } from "../../lib/tokens";
import { readyYear, yearscapeReady } from "../../lib/yearscape-ready";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const listener = testUser();
const quiet = testUser();
let token = "";
const at = (date: string) => new Date(`${date}T12:00:00Z`);

before(async () => {
  await createTestUser(listener.userId);
  await createTestUser(quiet.userId);
  token = await createToken(listener.userId, "Yearscape test");
  const play = (title: string, day: string, artist = listener.artist) => ({
    artist,
    title,
    playedAt: at(day),
    durationMs: 200_000,
  });
  await importListens(listener.userId, [
    play("Favourite", "2024-03-01"),
    play("Favourite", "2024-06-01"),
    play("Other", "2024-07-01", `${listener.artist} Duo`),
    play("Next Year", "2025-02-01"),
  ]);
});

after(async () => {
  await removeTestUser(listener);
  await removeTestUser({ ...listener, artist: `${listener.artist} Duo` });
  await removeTestUser(quiet);
  await closeConnections();
});

describe("Yearscape ready for the desktop app", () => {
  it("is ready in December for this year and in January for last year", () => {
    assert.equal(readyYear(at("2024-12-01")), 2024);
    assert.equal(readyYear(at("2024-12-31")), 2024);
    assert.equal(readyYear(at("2025-01-15")), 2024);
    assert.equal(readyYear(at("2025-02-01")), null);
    assert.equal(readyYear(at("2024-11-30")), null);
  });

  it("sums up the year when it's ready", async () => {
    const ready = await yearscapeReady(listener.userId, at("2024-12-05"));
    assert.deepEqual(ready, {
      ready: true,
      year: 2024,
      plays: 3,
      listeningMs: 600_000,
      topArtist: listener.artist,
      topSong: { title: "Favourite", artist: listener.artist },
      newArtists: 2,
      url: "/yearscape?year=2024",
    });
    assert.equal((await yearscapeReady(listener.userId, at("2025-01-10"))).ready, true);
  });

  it("stays quiet the rest of the year and for people with no plays", async () => {
    assert.deepEqual(await yearscapeReady(listener.userId, at("2024-08-01")), { ready: false });
    assert.deepEqual(await yearscapeReady(quiet.userId, at("2024-12-05")), { ready: false });
  });

  it("answers the desktop app with its token", async () => {
    assert.equal((await fetch(`${BASE_URL}/api/yearscape`)).status, 401);
    const response = await fetch(`${BASE_URL}/api/yearscape`, { headers: { authorization: `Token ${token}` } });
    assert.equal(response.status, 200);
    assert.equal(typeof ((await response.json()) as { ready: unknown }).ready, "boolean");
  });
});
