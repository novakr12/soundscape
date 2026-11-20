import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { follow } from "../../lib/follows";
import { saveNavidrome } from "../../lib/navidrome";
import { sql } from "../../lib/postgres";
import { createToken } from "../../lib/tokens";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

process.env.AUTH_SECRET ??= "test-only-secret";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const host = testUser();
const guest = testUser();
const stranger = testUser();
const audio = Buffer.from(Array.from({ length: 500 }, (_, i) => i % 256));
const library = [
  { id: "song-1", title: "First Song", artist: host.artist, coverArt: "al-1" },
  { id: "song-2", title: "Second Song", artist: host.artist, coverArt: "al-2" },
  { id: "song-3", title: "Guest Pick", artist: "Picked Band", coverArt: "al-3" },
];
const hostDevice = `hostdev${host.run}`;
const guestDevice = `guestdev${guest.run}`;
const strangerDevice = `strangerdev${stranger.run}`;
let server: Server;
let hostToken = "";
let guestToken = "";
let strangerToken = "";
let partyId = "";

const first = {
  trackId: "first-song",
  title: "First Song",
  artist: host.artist,
  cover: "/api/navidrome/cover/al-1",
  songId: "song-1",
};
const second = { ...first, trackId: "second-song", title: "Second Song", songId: "song-2" };

function subsonic(body: Record<string, unknown>) {
  return JSON.stringify({ "subsonic-response": { status: "ok", version: "1.16.1", ...body } });
}

function fakeNavidrome() {
  return createServer((request, response) => {
    const address = new URL(request.url ?? "", "http://localhost");
    const params = address.searchParams;
    const token = createHash("md5")
      .update(`secret${params.get("s")}`)
      .digest("hex");
    if (params.get("u") !== "dj" || params.get("t") !== token) {
      response.end(JSON.stringify({ "subsonic-response": { status: "failed", error: { code: 40 } } }));
      return;
    }
    const method = address.pathname.replace(/^\/rest\/|\.view$/g, "");
    if (method === "ping") return response.end(subsonic({}));
    if (method === "search3") {
      const words = (params.get("query") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const song = library.filter((s) => words.every((word) => `${s.artist} ${s.title}`.toLowerCase().includes(word)));
      return response.end(subsonic({ searchResult3: { song } }));
    }
    if (method === "stream") {
      response.setHeader("content-type", "audio/mpeg");
      response.setHeader("content-length", audio.length);
      return response.end(audio);
    }
    response.statusCode = 404;
    response.end();
  });
}

function call(path: string, value: string, body?: unknown, method?: string) {
  return fetch(`${BASE_URL}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { authorization: `Token ${value}`, "content-type": "application/json", "user-agent": "SoundscapeTest/1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function report(token: string, id: string, state: unknown) {
  return call("/api/devices", token, { id, name: `Device ${id}`, kind: "browser", state });
}

async function taken(token: string, id: string) {
  const answer = await (await call("/api/devices/take", token, { id })).json();
  return answer.commands as Record<string, unknown>[];
}

before(async () => {
  server = fakeNavidrome();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of [host, guest, stranger]) await createTestUser(user.userId);
  await saveNavidrome(host.userId, url, "dj", "secret");
  await follow(guest.userId, host.userId);
  hostToken = await createToken(host.userId, "Party test");
  guestToken = await createToken(guest.userId, "Party test");
  strangerToken = await createToken(stranger.userId, "Party test");
});

after(async () => {
  server.close();
  for (const user of [host, guest, stranger]) await removeTestUser(user);
  await closeConnections();
});

describe("parties", () => {
  it("starts from the device that's playing", async () => {
    assert.equal((await call("/api/party", hostToken)).status, 200);
    assert.equal((await fetch(`${BASE_URL}/api/party`)).status, 401);
    const nothing = await call("/api/party", hostToken, {});
    assert.equal(nothing.status, 409);
    await report(hostToken, hostDevice, { track: first, playing: true, time: 10, duration: 200 });
    const started = await (await call("/api/party", hostToken, {})).json();
    partyId = started.party.id;
    assert.match(partyId, /^[A-Za-z0-9_-]{12}$/);
    assert.equal(started.party.role, "host");
    assert.deepEqual(started.party.guests, []);
    assert.equal(started.party.track.cover, `/api/party/${partyId}/cover/al-1`);
  });

  it("lets a guest join and loads the host's song on their device", async () => {
    await report(guestToken, guestDevice, {});
    const joined = await call(`/api/party/${partyId}/join`, guestToken, { deviceId: guestDevice });
    assert.equal(joined.status, 200);
    const party = (await joined.json()).party;
    assert.equal(party.role, "guest");
    assert.equal(party.host, host.userId);
    const commands = await taken(guestToken, guestDevice);
    assert.equal(commands.length, 1);
    const load = commands[0] as { do: string; tracks: Record<string, unknown>[]; time: number; playing: boolean };
    assert.equal(load.do, "take");
    assert.equal(load.playing, true);
    assert.ok(load.time >= 10 && load.time < 15);
    assert.equal(load.tracks[0].songId, `party~${partyId}~song-1`);
    assert.equal(load.tracks[0].cover, `/api/party/${partyId}/cover/al-1`);
    const hosting = await (await call("/api/party", hostToken)).json();
    assert.deepEqual(hosting.party.guests, [guest.userId]);
  });

  it("streams the host's song only to people in the party", async () => {
    const shared = encodeURIComponent(`party~${partyId}~song-1`);
    const listening = await call(`/api/full-song/${shared}`, guestToken);
    assert.equal(listening.status, 200);
    assert.equal(Buffer.from(await listening.arrayBuffer()).length, audio.length);
    assert.equal((await call(`/api/full-song/${shared}`, strangerToken)).status, 404);
    const notPlayed = encodeURIComponent(`party~${partyId}~song-3`);
    assert.equal((await call(`/api/full-song/${notPlayed}`, guestToken)).status, 404);
  });

  it("follows the host's pause, seek and next song", async () => {
    await report(hostToken, hostDevice, { track: first, playing: false, time: 20, duration: 200 });
    assert.deepEqual(await taken(guestToken, guestDevice), [{ do: "pause" }]);
    await report(hostToken, hostDevice, { track: first, playing: true, time: 20, duration: 200 });
    const resumed = await taken(guestToken, guestDevice);
    assert.deepEqual(
      resumed.map((command) => command.do),
      ["seek", "play"],
    );
    await report(hostToken, hostDevice, { track: first, playing: true, time: 120, duration: 200 });
    const jumped = await taken(guestToken, guestDevice);
    assert.equal(jumped.length, 1);
    assert.equal(jumped[0].do, "seek");
    assert.ok((jumped[0].time as number) >= 120);
    await report(hostToken, hostDevice, { track: second, playing: true, time: 0, duration: 180 });
    const next = (await taken(guestToken, guestDevice)) as { do: string; tracks: { songId: string }[] }[];
    assert.equal(next[0].do, "take");
    assert.equal(next[0].tracks[0].songId, `party~${partyId}~song-2`);
  });

  it("puts songs a guest adds on the host's player, matched to the host's library", async () => {
    const pick = { trackId: "picked-band-guest-pick", title: "Guest Pick", artist: "Picked Band", songId: "theirs-9" };
    const added = await call(`/api/party/${partyId}/add`, guestToken, { track: pick, next: true });
    assert.equal(added.status, 200);
    const commands = (await taken(hostToken, hostDevice)) as {
      do: string;
      track: Record<string, unknown>;
      next: boolean;
    }[];
    assert.equal(commands.length, 1);
    assert.equal(commands[0].do, "enqueue");
    assert.equal(commands[0].next, true);
    assert.equal(commands[0].track.songId, "song-3");
    assert.equal(commands[0].track.cover, "/api/navidrome/cover/al-3");
    assert.equal((await call(`/api/party/${partyId}/add`, strangerToken, { track: pick })).status, 409);
    await report(hostToken, hostDevice, {
      track: second,
      playing: true,
      time: 2,
      duration: 180,
      upNext: [{ trackId: pick.trackId, title: pick.title, artist: pick.artist }],
    });
    const view = await (await call("/api/party", guestToken)).json();
    assert.deepEqual(view.party.upNext, [
      { trackId: pick.trackId, title: pick.title, artist: pick.artist, addedBy: guest.userId },
    ]);
    const shared = encodeURIComponent(`party~${partyId}~song-3`);
    assert.equal((await call(`/api/full-song/${shared}`, guestToken)).status, 200);
  });

  it("invites only friends and shows the party to visitors", async () => {
    const invited = await (
      await call(`/api/party/${partyId}/invite`, hostToken, { users: [guest.userId, stranger.userId] })
    ).json();
    assert.deepEqual(invited.invited, [guest.userId]);
    const [note] =
      await sql`SELECT kind, other_user, detail FROM notifications WHERE user_id = ${guest.userId} AND kind = 'party'`;
    assert.deepEqual({ ...note }, { kind: "party", other_user: host.userId, detail: partyId });
    assert.equal((await call(`/api/party/${partyId}/invite`, guestToken, { users: [host.userId] })).status, 403);
    const visit = await (await call(`/api/party/${partyId}`, strangerToken)).json();
    assert.equal(visit.party.role, "visitor");
  });

  it("drops a guest who starts their own music", async () => {
    await sql`UPDATE party_members SET sent_at = now() - interval '1 minute' WHERE user_id = ${guest.userId}`;
    await report(guestToken, guestDevice, {
      track: { trackId: "something-else", title: "Something Else", artist: "Other Band" },
      playing: true,
      time: 5,
    });
    const view = await (await call("/api/party", guestToken)).json();
    assert.equal(view.party, null);
    const hosting = await (await call("/api/party", hostToken)).json();
    assert.deepEqual(hosting.party.guests, []);
  });

  it("pauses everyone when the host ends the party", async () => {
    await report(strangerToken, strangerDevice, {});
    assert.equal((await call(`/api/party/${partyId}/join`, strangerToken, { deviceId: strangerDevice })).status, 200);
    await taken(strangerToken, strangerDevice);
    assert.equal((await call("/api/party", hostToken, undefined, "DELETE")).status, 200);
    assert.deepEqual(await taken(strangerToken, strangerDevice), [{ do: "pause" }]);
    assert.equal((await (await call("/api/party", strangerToken)).json()).party, null);
    assert.equal((await call(`/api/party/${partyId}/join`, guestToken, { deviceId: guestDevice })).status, 409);
    const shared = encodeURIComponent(`party~${partyId}~song-1`);
    assert.equal((await call(`/api/full-song/${shared}`, strangerToken)).status, 404);
  });
});
