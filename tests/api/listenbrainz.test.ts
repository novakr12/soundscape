import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { getHistory } from "../../lib/history";
import { getRecent } from "../../lib/live";
import { sql } from "../../lib/postgres";
import { monthBucket } from "../../lib/time";
import { createToken } from "../../lib/tokens";
import { chartEntry, closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const user = testUser();
const { userId, artist } = user;
let token = "";

function submit(body: unknown, authorization: string | null = `Token ${token}`) {
  return fetch(`${BASE_URL}/1/submit-listens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function listen(title: string, listenedAt?: number) {
  return {
    ...(listenedAt ? { listened_at: listenedAt } : {}),
    track_metadata: { artist_name: artist, track_name: title, additional_info: { duration_ms: 200_000 } },
  };
}

async function listenCount(title: string) {
  const [row] = await sql`
    SELECT plays FROM user_track_plays WHERE user_id = ${userId} AND track_id = ${trackIdFor(artist, title)}`;
  return row?.plays ?? 0;
}

before(async () => {
  await createTestUser(userId);
  token = await createToken(userId, "Test");
});

after(async () => {
  await removeTestUser(user);
  await closeConnections();
});

describe("GET /1/validate-token", () => {
  it("accepts a valid token and names its user", async () => {
    const response = await fetch(`${BASE_URL}/1/validate-token`, { headers: { Authorization: `Token ${token}` } });
    assert.deepEqual(await response.json(), { code: 200, message: "Token valid.", valid: true, user_name: userId });
  });

  it("accepts the lowercase token header Pano Scrobbler sends", async () => {
    const response = await fetch(`${BASE_URL}/1/validate-token`, { headers: { Authorization: `token ${token}` } });
    assert.equal((await response.json()).valid, true);
  });

  it("accepts the token as a query parameter", async () => {
    const response = await fetch(`${BASE_URL}/1/validate-token?token=${token}`);
    assert.equal((await response.json()).valid, true);
  });

  it("rejects an unknown token", async () => {
    const response = await fetch(`${BASE_URL}/1/validate-token`, { headers: { Authorization: "Token wrong" } });
    assert.equal((await response.json()).valid, false);
  });

  it("asks for a token when none is given", async () => {
    const response = await fetch(`${BASE_URL}/1/validate-token`);
    assert.equal(response.status, 400);
  });
});

describe("POST /1/submit-listens", () => {
  it("rejects requests without a valid token", async () => {
    assert.equal((await submit({ listen_type: "single", payload: [listen("A")] }, null)).status, 401);
    assert.equal((await submit({ listen_type: "single", payload: [listen("A")] }, "Token wrong")).status, 401);
  });

  it("rejects malformed submissions", async () => {
    assert.equal((await submit("not json")).status, 400);
    assert.equal((await submit({ listen_type: "everything", payload: [listen("A")] })).status, 400);
    assert.equal((await submit({ listen_type: "single", payload: [] })).status, 400);
    assert.equal((await submit({ listen_type: "single", payload: [listen("A"), listen("B")] })).status, 400);
    const withoutTitle = [{ track_metadata: { artist_name: artist } }];
    assert.equal((await submit({ listen_type: "playing_now", payload: withoutTitle })).status, 400);
    assert.equal((await submit({ listen_type: "single", payload: [null] })).status, 400);
    assert.equal((await submit({ listen_type: "import", payload: [listen("Fine"), "nonsense"] })).status, 400);
  });

  it("stores playing_now as Listening now only, with the song length", async () => {
    const response = await submit({ listen_type: "playing_now", payload: [listen("Now Playing")] });
    assert.deepEqual(await response.json(), { status: "ok" });

    const [row] = await sql`SELECT data, expires_at FROM listening WHERE user_id = ${userId}`;
    assert.equal(row.data.trackId, trackIdFor(artist, "Now Playing"));
    assert.equal(row.data.durationMs, 200_000);
    assert.ok(Math.abs(Date.now() - row.data.startedAt) < 10_000);
    const ttl = (row.expires_at.getTime() - Date.now()) / 1000;
    assert.ok(ttl > 180 && ttl <= 200, `unexpected TTL ${ttl}`);

    assert.equal(await listenCount("Now Playing"), 0);
    assert.equal((await getHistory(userId, monthBucket(new Date()))).length, 0);
  });

  it("records a single listen in the database and the charts", async () => {
    const now = Math.floor(Date.now() / 1000);
    const response = await submit({ listen_type: "single", payload: [listen("First Song", now)] });
    assert.deepEqual(await response.json(), { status: "ok" });

    const history = await getHistory(userId, monthBucket(new Date()));
    assert.deepEqual(
      history.map((play) => [play.title, play.artist]),
      [["First Song", artist]],
    );
    assert.equal(await listenCount("First Song"), 1);
    assert.equal((await chartEntry(trackIdFor(artist, "First Song")))?.plays, 1);
    assert.equal((await getRecent(userId))[0]?.title, "First Song");
  });

  it("stores the song length the player sends", async () => {
    await submit({ listen_type: "single", payload: [listen("Timed Song")] });
    const [row] = await sql`SELECT duration_ms FROM tracks WHERE id = ${trackIdFor(artist, "Timed Song")}`;
    assert.equal(row?.duration_ms, 200_000);
  });

  it("counts a repeated listen again", async () => {
    await submit({ listen_type: "single", payload: [listen("First Song")] });
    assert.equal(await listenCount("First Song"), 2);
  });

  it("imports several listens and keeps their timestamps", async () => {
    const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
    const timestamps = [0, 1, 2].map((i) => twoHoursAgo + i * 60);
    const payload = timestamps.map((timestamp, i) => listen(`Imported ${i}`, timestamp));
    const response = await submit({ listen_type: "import", payload });
    assert.deepEqual(await response.json(), { status: "ok" });

    const months = new Set(timestamps.map((timestamp) => monthBucket(new Date(timestamp * 1000))));
    const imported = (await Promise.all([...months].map((month) => getHistory(userId, month))))
      .flat()
      .filter((play) => play.title.startsWith("Imported"));
    assert.deepEqual(imported.map((play) => play.playedAt.getTime() / 1000).sort(), timestamps);
  });

  it("skips listens dated in the future", async () => {
    const nextYear = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    const response = await submit({ listen_type: "single", payload: [listen("From The Future", nextYear)] });
    assert.equal(response.status, 400);
    assert.equal(await listenCount("From The Future"), 0);
  });
});
