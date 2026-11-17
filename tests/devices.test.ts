import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deviceKind,
  deviceName,
  isDeviceId,
  isOnline,
  newDeviceId,
  nowPlayingLine,
  readDeviceCommand,
  readDeviceReport,
  readDeviceState,
  timeNow,
} from "../lib/devices";

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
        track: { ...song, songId: null },
        playing: true,
        time: 12.5,
        duration: 200,
        volume: 1,
        blocked: false,
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

  it("reads a handed-over queue", () => {
    const command = readDeviceCommand({
      do: "take",
      tracks: [song, { trackId: "t2" }, { ...song, trackId: "t3", albumHref: "https://evil.example", duration: 180 }],
      position: 1,
      time: 42,
    });
    assert.deepEqual(command, {
      do: "take",
      tracks: [
        { trackId: "t1", title: "Song", artist: "Band", album: "Record", cover: "/api/cover/t1" },
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
