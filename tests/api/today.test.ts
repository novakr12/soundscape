import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { importListens } from "../../lib/imports";
import { addDays, localDay, startOfDay } from "../../lib/time";
import { createToken } from "../../lib/tokens";
import { awayFromMidnight, closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const active = testUser();
const resting = testUser();
const tokens = new Map<string, string>();

const ask = async (userId?: string) => {
  const response = await fetch(`${BASE_URL}/api/today`, {
    headers: userId ? { authorization: `Token ${tokens.get(userId)}` } : {},
  });
  return { status: response.status, body: response.ok ? await response.json() : null };
};

before(async () => {
  await awayFromMidnight(2 * 60_000, 2 * 60_000);
  const yesterday = new Date(startOfDay(addDays(localDay(new Date()), -1)).getTime() + 12 * 3_600_000);
  for (const user of [active, resting]) {
    await createTestUser(user.userId);
    tokens.set(user.userId, await createToken(user.userId, "Today test"));
    await importListens(user.userId, [
      { artist: user.artist, title: "Yesterday", playedAt: yesterday, durationMs: 180_000 },
    ]);
  }
  await importListens(active.userId, [
    { artist: active.artist, title: "Morning", playedAt: new Date(Date.now() - 50_000), durationMs: 200_000 },
    { artist: active.artist, title: "Morning", playedAt: new Date(Date.now() - 40_000), durationMs: 200_000 },
  ]);
});

after(async () => {
  await removeTestUser(active);
  await removeTestUser(resting);
  await closeConnections();
});

describe("Today's stats for the desktop app", () => {
  it("needs a token", async () => {
    assert.equal((await ask()).status, 401);
  });

  it("counts today's plays, listening time and the streak", async () => {
    assert.deepEqual((await ask(active.userId)).body, {
      plays: 2,
      listeningMs: 400_000,
      streak: 2,
      playedToday: true,
    });
  });

  it("keeps yesterday's streak alive until the day ends", async () => {
    assert.deepEqual((await ask(resting.userId)).body, {
      plays: 0,
      listeningMs: 0,
      streak: 1,
      playedToday: false,
    });
  });
});
