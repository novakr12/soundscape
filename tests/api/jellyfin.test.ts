import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { getJellyfin, playbackFor, pollJellyfin, removeJellyfin, saveJellyfin } from "../../lib/jellyfin";
import { getListening, USER_CHANNEL } from "../../lib/live";
import { sql } from "../../lib/postgres";
import { rotateToken } from "../../lib/tokens";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

process.env.AUTH_SECRET ??= "test-only-secret";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const API_KEY = "jellyfin-test-key";
const user = testUser();
const title = "Long Song";
const trackId = trackIdFor(user.artist, title);
const DURATION_MS = 300_000;

let playing: { startedAt: number; pausedAt?: number } | null = null;
let server: Server;
let url: string;
let subscriber: { unlisten: () => Promise<void> };
const published: string[] = [];

function sessions() {
  if (!playing) return [{ UserId: "jf-user", NowPlayingItem: undefined }];
  const positionMs = (playing.pausedAt ?? Date.now()) - playing.startedAt;
  return [
    { UserId: "someone-else", NowPlayingItem: { Type: "Audio", Name: "Other", Artists: ["Other"] } },
    {
      UserId: "jf-user",
      NowPlayingItem: { Type: "Audio", Name: title, Artists: [user.artist, "Guest"], RunTimeTicks: DURATION_MS * 1e4 },
      PlayState: { PositionTicks: positionMs * 1e4, IsPaused: Boolean(playing.pausedAt) },
    },
  ];
}

function fakeJellyfin() {
  return createServer((request, response) => {
    if (request.headers.authorization !== `MediaBrowser Token="${API_KEY}"`) {
      response.statusCode = 401;
      return response.end();
    }
    const path = new URL(request.url ?? "", "http://localhost").pathname;
    if (path === "/Users") return response.end(JSON.stringify([{ Id: "jf-user", Name: "Listener" }]));
    if (path === "/Sessions") return response.end(JSON.stringify(sessions()));
    response.statusCode = 404;
    response.end();
  });
}

const announced = () => published.length > 0 && published.every((message) => message === "listening");

function change(update: () => void) {
  published.length = 0;
  update();
}

async function poll() {
  await pollJellyfin();
  await new Promise((resolve) => setTimeout(resolve, 100));
  return getListening(user.userId);
}

function nowPlaying(token: string) {
  return fetch(`${BASE_URL}/1/submit-listens`, {
    method: "POST",
    headers: { authorization: `Token ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      listen_type: "playing_now",
      payload: [{ track_metadata: { artist_name: user.artist, track_name: "Another Song" } }],
    }),
  });
}

before(async () => {
  server = fakeJellyfin();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  subscriber = await sql.listen(USER_CHANNEL, (message) => {
    const { userId, event } = JSON.parse(message);
    if (userId === user.userId) published.push(event);
  });

  await createTestUser(user.userId);
  await importListens(user.userId, [{ artist: user.artist, title, playedAt: new Date(Date.now() - 86_400_000) }]);
  await sql`UPDATE tracks SET cover = 'https://example.com/cover.jpg' WHERE id = ${trackId}`;
});

after(async () => {
  server.close();
  await subscriber.unlisten();
  await removeTestUser(user);
  await closeConnections();
});

describe("Jellyfin connection", () => {
  it("refuses a wrong API key, an unknown user and a bad address", async () => {
    await assert.rejects(saveJellyfin(user.userId, url, "wrong", "Listener"), /did not accept/);
    await assert.rejects(saveJellyfin(user.userId, url, API_KEY, "nobody"), /no user called nobody/);
    await assert.rejects(saveJellyfin(user.userId, "jellyfin.local", API_KEY, "Listener"), /full address/);
    assert.equal(await getJellyfin(user.userId), null);
  });

  it("stores the API key encrypted and the username as Jellyfin spells it", async () => {
    await saveJellyfin(user.userId, `${url}/web/`, API_KEY, "listener");
    const [row] = await sql`SELECT api_key FROM jellyfin_settings WHERE user_id = ${user.userId}`;
    assert.notEqual(row?.api_key, API_KEY);
    assert.deepEqual(await getJellyfin(user.userId), {
      url,
      apiKey: API_KEY,
      username: "Listener",
      jellyfinUserId: "jf-user",
    });
  });
});

describe("Jellyfin playback", () => {
  it("picks the user's audio session and prefers one that is playing", () => {
    const audio = (name: string, paused: boolean) => ({
      UserId: "u1",
      NowPlayingItem: { Type: "Audio", Name: name, AlbumArtist: "Band", RunTimeTicks: 1e9 },
      PlayState: { PositionTicks: 5e7, IsPaused: paused },
    });
    const playback = playbackFor(
      [
        { UserId: "u1", NowPlayingItem: { Type: "Movie", Name: "Film" } },
        audio("Paused Song", true),
        audio("Playing Song", false),
        { ...audio("Not Mine", false), UserId: "u2" },
      ],
      "u1",
    );
    assert.deepEqual(playback, {
      title: "Playing Song",
      artist: "Band",
      durationMs: 100_000,
      positionMs: 5_000,
      paused: false,
    });
    assert.equal(playbackFor([], "u1"), null);
  });

  it("shows the exact position from Jellyfin", async () => {
    change(() => (playing = { startedAt: Date.now() - 60_000 }));
    const listening = await poll();
    assert.equal(listening?.trackId, trackId);
    assert.equal(listening?.artist, user.artist);
    assert.equal(listening?.source, "jellyfin");
    assert.equal(listening?.durationMs, DURATION_MS);
    assert.equal(listening?.cover, "https://example.com/cover.jpg");
    assert.ok(Math.abs(listening!.startedAt! - playing!.startedAt) < 1000);
    assert.ok(announced(), `published ${published}`);
  });

  it("stays quiet while the song plays on as expected", async () => {
    const before = await getListening(user.userId);
    change(() => {});
    const listening = await poll();
    assert.equal(listening?.startedAt, before?.startedAt);
    assert.deepEqual(published, []);
  });

  it("ignores the plugin's playing now while Jellyfin reports the position", async () => {
    const response = await nowPlaying(await rotateToken(user.userId));
    assert.equal(response.status, 200);
    assert.equal((await getListening(user.userId))?.trackId, trackId);
  });

  it("follows a seek and a pause", async () => {
    change(() => (playing!.startedAt -= 90_000));
    let listening = await poll();
    assert.ok(Math.abs(listening!.startedAt! - playing!.startedAt) < 1000);
    assert.ok(announced(), `published ${published}`);

    change(() => (playing!.pausedAt = Date.now()));
    listening = await poll();
    assert.ok(listening?.pausedAt);
    assert.ok(Math.abs(listening!.pausedAt! - listening!.startedAt! - 150_000) < 1000);
    assert.ok(announced(), `published ${published}`);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    change(() => {});
    const still = await poll();
    assert.equal(still?.pausedAt, listening?.pausedAt);
    assert.deepEqual(published, []);
  });

  it("clears Listening now when playback stops, and lets other players in again", async () => {
    change(() => (playing = null));
    assert.equal(await poll(), null);
    assert.ok(announced(), `published ${published}`);

    const response = await nowPlaying(await rotateToken(user.userId));
    assert.equal(response.status, 200);
    assert.equal((await getListening(user.userId))?.title, "Another Song");
    assert.equal(await poll().then((l) => l?.title), "Another Song");
  });

  it("clears its own Listening now on disconnect", async () => {
    change(() => (playing = { startedAt: Date.now() - 1000 }));
    assert.equal((await poll())?.source, "jellyfin");
    await removeJellyfin(user.userId);
    assert.equal(await getListening(user.userId), null);
    assert.equal(await getJellyfin(user.userId), null);
  });
});
