import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deviceKind,
  deviceName,
  givenDevice,
  isDeviceId,
  isHeld,
  isOnline,
  newDeviceId,
  nowPlayingLine,
  readDeviceCommand,
  readDeviceReport,
  readDeviceState,
  shownPlayback,
  timeNow,
} from "../lib/devices";
import { fitMessage } from "../lib/player-devices";

const song = { trackId: "t1", title: "Song", artist: "Band", album: "Record", cover: "/api/cover/t1" };

describe("device reports", () => {
  it("reads a report and keeps only what it knows", () => {
    const report = readDeviceReport({
      id: "abcdefgh12",
      name: "Firefox on Linux",
      kind: "browser",
      state: { track: { ...song, extra: 1 }, playing: true, time: 12.5, duration: 200, volume: 3, blocked: false },
    });
    assert.deepEqual(report, {
      id: "abcdefgh12",
      name: "Firefox on Linux",
      kind: "browser",
      state: {
        track: { ...song, songId: null, albumHref: null, artistHref: null },
        playing: true,
        time: 12.5,
        duration: 200,
        volume: 1,
        blocked: false,
        shuffle: null,
        repeat: null,
        upNext: [],
      },
    });
  });

  it("turns away bad ids, kinds and names", () => {
    assert.equal(readDeviceReport({ id: "short", name: "x", kind: "browser" }), null);
    assert.equal(readDeviceReport({ id: "abcdefgh12", name: "x", kind: "toaster" }), null);
    assert.equal(readDeviceReport({ id: "abcdefgh12", name: " ", kind: "browser" }), null);
    assert.equal(isDeviceId("../../etc/passwd"), false);
    assert.equal(isDeviceId(newDeviceId()), true);
  });

  it("reads shuffle, repeat and what plays next", () => {
    const state = readDeviceState({
      track: { ...song, albumHref: "/album/band-record" },
      shuffle: true,
      repeat: "one",
      upNext: [
        { trackId: "t2", title: "Two", artist: "Band", cover: "/x" },
        { trackId: "t3" },
        ...Array.from({ length: 20 }, (_, i) => ({ trackId: `n${i}`, title: "N", artist: "Band" })),
      ],
    });
    assert.equal(state.track?.albumHref, "/album/band-record");
    assert.equal(state.shuffle, true);
    assert.equal(state.repeat, "one");
    assert.deepEqual(state.upNext[0], { trackId: "t2", title: "Two", artist: "Band" });
    assert.equal(state.upNext.length, 10);
    const odd = readDeviceState({ track: { ...song, albumHref: "//evil.example" }, shuffle: "yes", repeat: "twice" });
    assert.equal(odd.track?.albumHref, null);
    assert.equal(odd.shuffle, null);
    assert.equal(odd.repeat, null);
  });

  it("is not playing without a song and drops outside covers", () => {
    const state = readDeviceState({ track: null, playing: true });
    assert.equal(state.playing, false);
    assert.equal(state.volume, 0.8);
    assert.equal(readDeviceState({ track: { ...song, cover: "javascript:alert(1)" } }).track?.cover, null);
    assert.equal(
      readDeviceState({ track: { ...song, cover: "https://x.example/a.jpg" } }).track?.cover,
      "https://x.example/a.jpg",
    );
  });
});

describe("device commands", () => {
  it("reads the simple ones", () => {
    for (const name of ["play", "pause", "toggle", "next", "previous"]) {
      assert.deepEqual(readDeviceCommand({ do: name }), { do: name });
    }
    assert.deepEqual(readDeviceCommand({ do: "seek", time: 30 }), { do: "seek", time: 30 });
    assert.equal(readDeviceCommand({ do: "seek", time: -1 }), null);
    assert.deepEqual(readDeviceCommand({ do: "volume", volume: 0.5 }), { do: "volume", volume: 0.5 });
    assert.equal(readDeviceCommand({ do: "volume", volume: 2 }), null);
    assert.equal(readDeviceCommand({ do: "explode" }), null);
    assert.deepEqual(readDeviceCommand({ do: "send", to: "abcdefgh12" }), { do: "send", to: "abcdefgh12" });
    assert.equal(readDeviceCommand({ do: "send", to: "x" }), null);
  });

  it("reads shuffle, repeat and jumps", () => {
    assert.deepEqual(readDeviceCommand({ do: "shuffle", on: false }), { do: "shuffle", on: false });
    assert.equal(readDeviceCommand({ do: "shuffle" }), null);
    assert.deepEqual(readDeviceCommand({ do: "repeat", mode: "all" }), { do: "repeat", mode: "all" });
    assert.equal(readDeviceCommand({ do: "repeat", mode: "forever" }), null);
    assert.deepEqual(readDeviceCommand({ do: "jump", ahead: 3 }), { do: "jump", ahead: 3 });
    assert.equal(readDeviceCommand({ do: "jump", ahead: 0 }), null);
    assert.equal(readDeviceCommand({ do: "jump", ahead: 11 }), null);
    assert.equal(readDeviceCommand({ do: "jump", ahead: 1.5 }), null);
  });

  it("reads a song to queue up", () => {
    assert.deepEqual(readDeviceCommand({ do: "enqueue", track: song, next: true }), {
      do: "enqueue",
      track: { trackId: "t1", title: "Song", artist: "Band", album: "Record", cover: "/api/cover/t1" },
      next: true,
    });
    assert.deepEqual(
      readDeviceCommand({
        do: "enqueue",
        track: { ...song, artistHref: "/artist/band?name=Band" },
      }),
      {
        do: "enqueue",
        track: {
          trackId: "t1",
          title: "Song",
          artist: "Band",
          album: "Record",
          artistHref: "/artist/band?name=Band",
          cover: "/api/cover/t1",
        },
        next: false,
      },
    );
    assert.equal(
      (
        readDeviceCommand({
          do: "enqueue",
          track: { ...song, artistHref: "https://evil.example/artist" },
        }) as { track: { artistHref?: string } }
      ).track.artistHref,
      undefined,
    );
    assert.equal((readDeviceCommand({ do: "enqueue", track: song }) as { next: boolean }).next, false);
    assert.equal(readDeviceCommand({ do: "enqueue", track: { trackId: "x" } }), null);
    assert.equal(readDeviceCommand({ do: "enqueue" }), null);
  });

  it("reads a handed-over queue", () => {
    const command = readDeviceCommand({
      do: "take",
      tracks: [
        { ...song, artistHref: "/artist/band" },
        { trackId: "t2" },
        {
          ...song,
          trackId: "t3",
          albumHref: "https://evil.example",
          artistHref: "https://evil.example",
          duration: 180,
        },
      ],
      position: 1,
      time: 42,
    });
    assert.deepEqual(command, {
      do: "take",
      tracks: [
        {
          trackId: "t1",
          title: "Song",
          artist: "Band",
          album: "Record",
          artistHref: "/artist/band",
          cover: "/api/cover/t1",
        },
        { trackId: "t3", title: "Song", artist: "Band", album: "Record", cover: "/api/cover/t1", duration: 180 },
      ],
      position: 1,
      time: 42,
      playing: true,
    });
    assert.equal(readDeviceCommand({ do: "take", tracks: [song], position: 1 }), null);
    assert.equal(readDeviceCommand({ do: "take", tracks: [], position: 0 }), null);
  });
});

describe("device helpers", () => {
  it("knows which devices are still around", () => {
    assert.equal(isOnline({ at: 1000 }, 1000 + 60_000), true);
    assert.equal(isOnline({ at: 1000 }, 1000 + 200_000), false);
  });

  it("moves the clock forward only while playing", () => {
    const state = readDeviceState({ track: song, playing: true, time: 10, duration: 30 });
    assert.equal(timeNow(state, 0, 5000), 15);
    assert.equal(timeNow(state, 0, 60_000), 30);
    assert.equal(timeNow({ ...state, playing: false }, 0, 5000), 10);
  });

  it("shows what a button press did before the device confirms it", () => {
    const state = readDeviceState({ track: song, playing: true, time: 10, duration: 30 });
    const device = { id: "abcdefgh12", name: "x", kind: "browser" as const, at: 0, state };
    assert.deepEqual(shownPlayback(device, 2000, null, 2000), { playing: true, time: 12 });
    assert.deepEqual(shownPlayback(device, 2000, { playing: false, since: 1000 }, 2000), { playing: false, time: 10 });
    assert.deepEqual(shownPlayback(device, 2000, { playing: true, time: 25, since: 1000 }, 2000), {
      playing: true,
      time: 26,
    });
    assert.deepEqual(shownPlayback(device, 2000, { playing: true, time: 29.5, since: 1000 }, 3000), {
      playing: true,
      time: 30,
    });
    assert.deepEqual(shownPlayback(device, 9000, { playing: false, since: 1000 }, 9000), { playing: true, time: 19 });
  });

  it("names the device", () => {
    const firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
    const chromeAndroid = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
    assert.equal(deviceKind({}, firefox), "browser");
    assert.equal(deviceKind({ soundscapeDesktop: {} }, firefox), "desktop");
    assert.equal(deviceKind({}, `${chromeAndroid} SoundscapeAndroid/0.6.0`), "android");
    assert.equal(deviceName("browser", firefox), "Firefox on Linux");
    assert.equal(deviceName("browser", chromeAndroid), "Chrome on Android");
    assert.equal(deviceName("desktop", firefox), "Soundscape desktop");
    assert.equal(deviceName("android", chromeAndroid), "Soundscape on Android");
  });

  it("uses the id and name the Android app gives the page", () => {
    assert.deepEqual(
      givenDevice({ soundscapeDeviceId: "phone0000abcd", soundscapeDeviceName: "Soundscape on Pixel 8" }),
      {
        id: "phone0000abcd",
        name: "Soundscape on Pixel 8",
      },
    );
    assert.deepEqual(givenDevice({ soundscapeDeviceId: "no", soundscapeDeviceName: 5 }), { id: null, name: null });
    assert.deepEqual(givenDevice({}), { id: null, name: null });
    assert.equal(isHeld({ soundscapeDeviceHeld: true }), true);
    assert.equal(isHeld({ soundscapeDeviceHeld: "yes" }), false);
    assert.equal(isHeld({}), false);
  });

  it("keeps live messages small enough for the database", () => {
    const long = "x".repeat(290);
    const state = readDeviceState({
      track: song,
      upNext: Array.from({ length: 10 }, (_, i) => ({ trackId: `${i}${long}`, title: long, artist: long })),
    });
    const device = { id: "abcdefgh12", name: "x", kind: "browser" as const, at: 0, state };
    const sent = JSON.parse(fitMessage({ user: "u", type: "device", device }));
    assert.deepEqual(sent.device.state.upNext, []);
    assert.equal(sent.device.state.track.title, "Song");
    const short = JSON.parse(
      fitMessage({ user: "u", type: "device", device: { ...device, state: readDeviceState({ track: song }) } }),
    );
    assert.equal(short.device.state.track.trackId, "t1");

    const wide = "🎵".repeat(1200);
    const hugeTrack = {
      trackId: wide,
      title: wide,
      artist: wide,
      album: wide,
      cover: `https://example.com/${"a".repeat(3000)}`,
      songId: "song1",
      albumHref: `/album/${"b".repeat(2000)}`,
      artistHref: `/artist/${"c".repeat(2000)}`,
    };
    const fitted = fitMessage({
      user: "u",
      type: "device",
      device: { id: "abcdefgh12", name: wide, kind: "browser", at: 0, state: { ...state, track: hugeTrack } },
    });
    assert.ok(Buffer.byteLength(fitted, "utf8") <= 7500, `got ${Buffer.byteLength(fitted, "utf8")} bytes`);
    const parsed = JSON.parse(fitted);
    assert.equal(parsed.device.state.track.cover, null);
    assert.ok(parsed.device.state.track.title.length > 0);
  });

  it("describes what plays", () => {
    const device = {
      id: "abcdefgh12",
      name: "x",
      kind: "browser" as const,
      at: 0,
      state: readDeviceState({ track: song }),
    };
    assert.equal(nowPlayingLine(device), "Song · Band");
    assert.equal(nowPlayingLine({ ...device, state: readDeviceState({}) }), "Nothing playing");
  });
});
