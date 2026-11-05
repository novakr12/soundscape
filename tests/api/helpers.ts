import { randomBytes } from "node:crypto";
import { getChartWithTracks } from "../../lib/charts";
import { deleteValues, deleteValuesStartingWith, keys } from "../../lib/kv";
import { sql } from "../../lib/postgres";
import { localDay, nextMidnight, startOfDay } from "../../lib/time";
import { createUser } from "../../lib/users";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function awayFromMidnight(beforeMs = 60_000, afterMs = 2 * 60_000) {
  const now = Date.now();
  const midnights = [
    startOfDay(localDay(new Date(now))).getTime(),
    nextMidnight(new Date(now)).getTime(),
    Math.floor(now / DAY_MS) * DAY_MS,
    Math.ceil(now / DAY_MS) * DAY_MS,
  ].filter((midnight) => midnight > now - beforeMs && midnight < now + afterMs);
  if (midnights.length > 0)
    await new Promise((resolve) => setTimeout(resolve, Math.max(...midnights) + beforeMs - now));
}

export function testUser() {
  const run = randomBytes(4).toString("hex");
  return { run, userId: `test_${run}`, artist: `Soundscape Test ${run}` };
}

export async function createTestUser(userId: string) {
  if (!(await createUser(userId, randomBytes(16).toString("hex")))) throw new Error("test user could not be created");
}

export async function removeTestUser({ userId, artist }: ReturnType<typeof testUser>) {
  const rows = await sql`
    SELECT DISTINCT track_id AS id FROM plays WHERE user_id = ${userId}
    UNION
    SELECT t.id FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE a.name = ${artist}`;
  const tracks = new Set(rows.map((row) => row.id as string));
  await sql`DELETE FROM plays WHERE user_id = ${userId} OR track_id = ANY(${[...tracks]})`;
  await sql`DELETE FROM users WHERE username = ${userId}`;
  await sql`DELETE FROM artists WHERE name = ${artist}`;
  await sql`DELETE FROM cover_cache WHERE track_id = ANY(${[...tracks]})`;
  await deleteValues(
    keys.loginFailures(userId),
    keys.importLock(userId),
    keys.coverProgress(userId),
    keys.lastfmProgress(userId),
    keys.listeningRecord(userId),
    keys.leaderboardAbove(userId),
  );
  await deleteValuesStartingWith(`yearscape:${userId}:`);
}

export async function chartEntry(trackId: string, days = [localDay(new Date())]) {
  const row = (await getChartWithTracks(days, 10_000)).find((entry) => entry.trackId === trackId);
  return row ? { plays: row.plays, listeners: row.listeners } : null;
}

export async function closeConnections() {
  await sql.end();
}
