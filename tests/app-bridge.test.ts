import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bridgeTracks,
  readCommand,
  readHandBack,
  remoteBridgeState,
  remoteCommand,
  savedVolume,
  wantsRemote,
} from "../lib/app-bridge";
import { readDeviceState } from "../lib/devices";

const album = [
  {
    trackId: "a-1",
    songId: "nd-1",
    title: "One",
    artist: "A",
    album: "X",
    duration: 200,
    gain: { track: -6, album: -4 },
  },
  { trackId: "a-2", title: "Two", artist: "A", album: "X", gain: { track: -8, album: -4 } },
  { trackId: "b-1", title: "Three", artist: "B", cover: "/api/cover/b-1" },
];

describe("bridgeTracks", () => {
  it("hands the app each song with its volume level", () => {
    const tracks = bridgeTracks(album, true);
    assert.equal(tracks[0].songId, "nd-1");
    assert.equal(tracks[1].songId, null);
    assert.equal(tracks[0].duration, 200);
    assert.equal(tracks[1].duration, null);
    assert.equal(tracks[0].level, tracks[1].level);
    assert.ok(tracks[0].level < 1);
    assert.equal(tracks[2].level, 1);
    assert.equal(tracks[2].cover, "/api/cover/b-1");
  });

  it("plays everything at full level when levelling is off", () => {
    assert.ok(bridgeTracks(album, false).every((track) => track.level === 1));
  });
});

describe("readHandBack", () => {
  it("accepts a position inside the queue", () => {
    assert.deepEqual(readHandBack({ position: 1, time: 12.5, playing: true }, 3), {
      position: 1,
      time: 12.5,
      playing: true,
      tracks: null,
    });
    assert.deepEqual(readHandBack({ position: 0, time: -4 }, 3), {
      position: 0,
      time: 0,
      playing: false,
      tracks: null,
    });
  });

  it("takes a new queue the app was given while it played", () => {
    const tracks = [
      { trackId: "a", title: "One", artist: "Band" },
      { trackId: "b", title: "Two", artist: "Band", songId: "nav-2", duration: 200 },
      { trackId: "c", title: "Three", artist: "Band" },
      { trackId: "d", title: "Four", artist: "Band" },
    ];
    const back = readHandBack({ position: 3, time: 5, playing: true, tracks }, 1);
    assert.equal(back?.position, 3);
    assert.equal(back?.tracks?.length, 4);
    assert.deepEqual(back?.tracks?.[1], { trackId: "b", title: "Two", artist: "Band", songId: "nav-2", duration: 200 });
    assert.equal(readHandBack({ position: 4, tracks }, 9), null);
    assert.equal(readHandBack({ position: 0, tracks: [] }, 9), null);
  });

  it("refuses anything else", () => {
    assert.equal(readHandBack({ position: 3, time: 0, playing: true }, 3), null);
    assert.equal(readHandBack({ position: 1.5 }, 3), null);
    assert.equal(readHandBack("1", 3), null);
    assert.equal(readHandBack(null, 3), null);
  });
});

describe("readCommand", () => {
  it("knows the player's commands and nothing else", () => {
    for (const name of ["play", "pause", "toggle", "next", "previous", "seek"]) assert.equal(readCommand(name), name);
    assert.equal(readCommand("delete"), null);
    assert.equal(readCommand(1), null);
  });
});

describe("savedVolume", () => {
  it("reads the page's volume and treats muted as silent", () => {
    assert.equal(savedVolume(JSON.stringify({ volume: 0.5, muted: false })), 0.5);
    assert.equal(savedVolume(JSON.stringify({ volume: 0.5, muted: true })), 0);
    assert.equal(savedVolume(null), 0.8);
    assert.equal(savedVolume("{broken"), 0.8);
    assert.equal(savedVolume(JSON.stringify({ volume: 4 })), 0.8);
  });
});

describe("the lock screen while following another device", () => {
  const device = {
    id: "desktop0001",
    name: "Soundscape desktop",
    kind: "desktop" as const,
    at: 1000,
    state: readDeviceState({
      track: { trackId: "t1", title: "Teardrop", artist: "Massive Attack", album: "Mezzanine", cover: "/api/cover/t1" },
      playing: true,
      time: 30,
      duration: 330,
      volume: 0.6,
    }),
  };

  it("only talks about other devices to apps that understand it", () => {
    assert.equal(wantsRemote({ soundscapeBridgeRemote: true }), true);
    assert.equal(wantsRemote({}), false);
  });

  it("shows the other device's song, moving on in time", () => {
    const state = remoteBridgeState(device, 3000);
    assert.deepEqual(state?.remote, { id: "desktop0001", name: "Soundscape desktop" });
    assert.equal(state?.tracks[0].title, "Teardrop");
    assert.equal(state?.position, 0);
    assert.equal(state?.time, 32);
    assert.equal(state?.playing, true);
    assert.equal(remoteBridgeState({ ...device, state: readDeviceState({}) }, 3000), null);
  });

  it("turns lock screen buttons into commands for that device", () => {
    assert.deepEqual(remoteCommand("toggle", undefined, true), { do: "pause" });
    assert.deepEqual(remoteCommand("toggle", undefined, false), { do: "play" });
    assert.deepEqual(remoteCommand("next", undefined, true), { do: "next" });
    assert.deepEqual(remoteCommand("seek", 42, true), { do: "seek", time: 42 });
    assert.equal(remoteCommand("seek", -1, true), null);
  });
});
