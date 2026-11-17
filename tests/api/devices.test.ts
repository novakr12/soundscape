import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sql } from "../../lib/postgres";
import { createToken } from "../../lib/tokens";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const user = testUser();
const other = testUser();
let token = "";
let otherToken = "";

const song = { trackId: "song-1", title: "Remote Song", artist: "Remote Band" };
const laptop = `laptop${user.run}`;
const phone = `phone${user.run}`;

function call(path: string, value: string, body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Token ${value}`, "content-type": "application/json", "user-agent": "SoundscapeTest/1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function report(id: string, state: unknown, value = token) {
  return call("/api/devices", value, { id, name: `Device ${id}`, kind: "browser", state });
}

async function listen(value: string) {
  const abort = new AbortController();
  const response = await fetch(`${BASE_URL}/api/devices/live`, {
    headers: { authorization: `Token ${value}`, "user-agent": "SoundscapeTest/1" },
    signal: abort.signal,
  });
  assert.equal(response.status, 200);
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";
  const waitFor = async (pattern: RegExp, ms = 5000) => {
    const until = Date.now() + ms;
    while (!pattern.test(text)) {
      if (Date.now() > until) throw new Error(`no ${pattern} in ${text}`);
      const chunk = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), Math.max(1, until - Date.now())),
        ),
      ]);
      if (chunk.value) text += decoder.decode(chunk.value, { stream: true });
    }
    return text;
  };
  await waitFor(/: connected/);
  return { waitFor, seen: () => text, close: () => abort.abort() };
}

before(async () => {
  await createTestUser(user.userId);
  await createTestUser(other.userId);
  token = await createToken(user.userId, "Devices test");
  otherToken = await createToken(other.userId, "Devices test");
});

after(async () => {
  await removeTestUser(user);
  await removeTestUser(other);
  await closeConnections();
});

describe("devices", () => {
  it("needs a login", async () => {
    assert.equal((await fetch(`${BASE_URL}/api/devices`)).status, 401);
    assert.equal((await fetch(`${BASE_URL}/api/devices/live`)).status, 401);
    assert.equal((await report(laptop, {}, "not-a-token")).status, 401);
  });

  it("lists what each of your players is playing, and only yours", async () => {
    assert.equal((await report(laptop, { track: song, playing: true, time: 20, duration: 180 })).status, 200);
    assert.equal((await report(phone, {})).status, 200);
    assert.equal((await call("/api/devices", token, { id: "x", name: "y", kind: "browser" })).status, 400);
    const answer = await (await call("/api/devices", token)).json();
    assert.equal(typeof answer.now, "number");
    const mine = new Map(answer.devices.map((device: { id: string }) => [device.id, device]));
    assert.equal(mine.size, 2);
    assert.deepEqual((mine.get(laptop) as { state: unknown }).state, {
      track: { ...song, album: null, cover: null, songId: null },
      playing: true,
      time: 20,
      duration: 180,
      volume: 0.8,
      blocked: false,
    });
    const theirs = await (await call("/api/devices", otherToken)).json();
    assert.deepEqual(theirs.devices, []);
  });

  it("passes a command to the device it's for, once", async () => {
    const live = await listen(token);
    const stranger = await listen(otherToken);
    try {
      const sent = await call("/api/devices/command", token, { to: laptop, command: { do: "pause" } });
      assert.equal(sent.status, 200);
      await live.waitFor(new RegExp(`event: command\\ndata: \\{"to":"${laptop}"\\}`));
      const taken = await (await call("/api/devices/take", token, { id: laptop })).json();
      assert.deepEqual(taken.commands, [{ do: "pause" }]);
      const again = await (await call("/api/devices/take", token, { id: laptop })).json();
      assert.deepEqual(again.commands, []);
      await report(laptop, { track: song, playing: false, time: 21, duration: 180 });
      await live.waitFor(/event: device\n/);
      assert.doesNotMatch(stranger.seen(), /event:/);
    } finally {
      live.close();
      stranger.close();
    }
  });

  it("refuses commands for devices that aren't yours or are gone", async () => {
    const theirs = await call("/api/devices/command", otherToken, { to: laptop, command: { do: "play" } });
    assert.equal(theirs.status, 404);
    const bad = await call("/api/devices/command", token, { to: laptop, command: { do: "format-disk" } });
    assert.equal(bad.status, 400);
    const self = await call("/api/devices/command", token, { to: laptop, command: { do: "send", to: laptop } });
    assert.equal(self.status, 400);
    await sql`UPDATE player_devices SET seen_at = now() - interval '10 minutes' WHERE user_id = ${user.userId} AND device_id = ${phone}`;
    const stale = await call("/api/devices/command", token, { to: phone, command: { do: "play" } });
    assert.equal(stale.status, 404);
    const answer = await (await call("/api/devices", token)).json();
    assert.deepEqual(
      answer.devices.map((device: { id: string }) => device.id),
      [laptop],
    );
  });

  it("hands a queue over and forgets a device that leaves", async () => {
    const handed = await call("/api/devices/command", token, {
      to: laptop,
      command: { do: "take", tracks: [song, { ...song, trackId: "song-2" }], position: 1, time: 12, playing: true },
    });
    assert.equal(handed.status, 200);
    const taken = await (await call("/api/devices/take", token, { id: laptop })).json();
    assert.equal(taken.commands[0].tracks[1].trackId, "song-2");
    const live = await listen(token);
    try {
      assert.equal((await call("/api/devices/leave", token, { id: laptop })).status, 200);
      await live.waitFor(new RegExp(`event: gone\\ndata: \\{"id":"${laptop}"\\}`));
    } finally {
      live.close();
    }
    assert.deepEqual((await (await call("/api/devices", token)).json()).devices, []);
  });
});
