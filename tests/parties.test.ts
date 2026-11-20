import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DeviceTrack } from "../lib/devices";
import {
  drifted,
  handedForGuests,
  hostTime,
  isPartyId,
  partyCover,
  partySongId,
  readPartySongId,
  stepForGuest,
} from "../lib/parties";

const track: DeviceTrack = {
  trackId: "massive-attack-teardrop",
  title: "Teardrop",
  artist: "Massive Attack",
  album: "Mezzanine",
  cover: "/api/navidrome/cover/al-42",
  songId: "song42",
  albumHref: "/album/mezzanine",
  artistHref: null,
};

describe("parties", () => {
  it("gives guests the host's song through the party", () => {
    const id = "Abc_def-1234";
    assert.ok(isPartyId(id));
    assert.ok(!isPartyId("short"));
    const shared = partySongId(id, "song42");
    assert.deepEqual(readPartySongId(shared), { partyId: id, songId: "song42" });
    assert.equal(readPartySongId("song42"), null);
    assert.equal(readPartySongId(`party~${id}~bad/id`), null);
    assert.equal(readPartySongId(`party~${id}~a~b`), null);
    assert.equal(partyCover(id, "/api/navidrome/cover/al-42"), `/api/party/${id}/cover/al-42`);
    assert.equal(partyCover(id, "https://cdn.example.com/a.jpg"), "https://cdn.example.com/a.jpg");
    const handed = handedForGuests(id, track, 245);
    assert.equal(handed.songId, shared);
    assert.equal(handed.cover, `/api/party/${id}/cover/al-42`);
    assert.equal(handed.duration, 245);
    assert.equal(handedForGuests(id, { ...track, songId: null }, null).songId, undefined);
  });

  it("tells each guest only what changed", () => {
    const host = { trackId: "a", playing: true, time: 30, jumped: false };
    assert.deepEqual(stepForGuest(host, { sentTrack: null, sentPlaying: null }), {
      kind: "load",
      time: 30,
      playing: true,
    });
    assert.deepEqual(stepForGuest(host, { sentTrack: "a", sentPlaying: true }), { kind: "none" });
    assert.deepEqual(stepForGuest({ ...host, playing: false }, { sentTrack: "a", sentPlaying: true }), {
      kind: "playing",
      playing: false,
      time: 30,
    });
    assert.deepEqual(stepForGuest({ ...host, jumped: true }, { sentTrack: "a", sentPlaying: true }), {
      kind: "seek",
      time: 30,
    });
    assert.deepEqual(stepForGuest({ ...host, trackId: "b" }, { sentTrack: "a", sentPlaying: true }), {
      kind: "load",
      time: 30,
      playing: true,
    });
    assert.deepEqual(stepForGuest({ ...host, trackId: null }, { sentTrack: "a", sentPlaying: true }), {
      kind: "stop",
    });
    assert.deepEqual(stepForGuest({ ...host, trackId: null }, { sentTrack: "a", sentPlaying: false }), {
      kind: "none",
    });
  });

  it("works out where the host is now", () => {
    const at = 1_000_000;
    assert.equal(hostTime({ playing: true, position: 10, positionAt: at }, at + 5000), 15);
    assert.equal(hostTime({ playing: false, position: 10, positionAt: at }, at + 5000), 10);
    assert.ok(drifted(20, 16));
    assert.ok(!drifted(20, 18.5));
  });
});
