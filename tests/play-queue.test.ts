import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compactTracks,
  countsAsPlay,
  heardStep,
  inOrder,
  insertAfter,
  LONGEST_QUEUE,
  lockScreenPosition,
  nextPosition,
  nextRepeat,
  queueWindow,
  removeAt,
  restoreQueue,
  seekTarget,
  shortcutFor,
  shuffleAfter,
  shuffleAll,
  songLength,
  startingWith,
  trimPlayed,
  unshuffle,
} from "../lib/play-queue";

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe("play queue", () => {
  it("cycles repeat through off, all and one", () => {
    assert.equal(nextRepeat("off"), "all");
    assert.equal(nextRepeat("all"), "one");
    assert.equal(nextRepeat("one"), "off");
  });

  it("shuffles only the songs after the one playing, keeping every song once", () => {
    const order = inOrder(10);
    const shuffled = shuffleAfter(order, 3, seeded(7));
    assert.deepEqual(shuffled.slice(0, 4), [0, 1, 2, 3]);
    assert.notDeepEqual(shuffled.slice(4), [4, 5, 6, 7, 8, 9]);
    assert.deepEqual(
      [...shuffled].sort((a, b) => a - b),
      order,
    );
    assert.deepEqual(
      [...shuffleAll(25, seeded(3))].sort((a, b) => a - b),
      inOrder(25),
    );
  });

  it("goes back to the original order from the song that is playing", () => {
    const shuffled = [0, 1, 7, 3, 9, 2, 4, 8, 5, 6];
    assert.deepEqual(unshuffle(shuffled, 4), { order: inOrder(10), position: 9 });
    assert.deepEqual(unshuffle([2, 0, 1], 0), { order: [0, 1, 2], position: 2 });
  });

  it("knows what comes next under each repeat mode", () => {
    assert.equal(nextPosition(0, 3, "off"), 1);
    assert.equal(nextPosition(2, 3, "off"), null);
    assert.equal(nextPosition(2, 3, "all"), 0);
    assert.equal(nextPosition(2, 3, "one"), null);
    assert.equal(nextPosition(0, 0, "all"), null);
  });

  it("puts a song right after the one playing, or removes one without losing its place", () => {
    assert.deepEqual(insertAfter([0, 1, 2], 0, 3), [0, 3, 1, 2]);
    assert.deepEqual(insertAfter([0, 1, 2], 2, 3), [0, 1, 2, 3]);
    assert.deepEqual(removeAt([0, 1, 2, 3], 2, 0), { order: [1, 2, 3], position: 1 });
    assert.deepEqual(removeAt([0, 1, 2, 3], 1, 3), { order: [0, 1, 2], position: 1 });
    assert.deepEqual(removeAt([0, 1, 2], 1, 1), { order: [0, 1, 2], position: 1 });
    assert.deepEqual(unshuffle([4, 0, 7, 2], 2), { order: [0, 2, 4, 7], position: 3 });
    assert.deepEqual(compactTracks(["a", "b", "c", "d"], [3, 1]), { tracks: ["b", "d"], order: [1, 0] });
    const list = Array.from({ length: 12 }, (_, i) => `t${i}`);
    const trimmed = trimPlayed(list, inOrder(12), 8, 3, 10);
    assert.equal(trimmed.position, 3);
    assert.deepEqual(trimmed.dropped, ["t0", "t1", "t2", "t3", "t4"]);
    assert.deepEqual(trimmed.tracks, ["t5", "t6", "t7", "t8", "t9", "t10", "t11"]);
    assert.deepEqual(trimmed.order, [0, 1, 2, 3, 4, 5, 6]);
  });

  it("only trusts a saved queue that makes sense", () => {
    const song = (n: number) => ({ trackId: `t${n}`, title: `Song ${n}`, artist: "Air" });
    assert.deepEqual(restoreQueue({ tracks: [song(0), song(1)], order: [1, 0], position: 1, time: 42.5 }), {
      tracks: [song(0), song(1)],
      order: [1, 0],
      position: 1,
      time: 42.5,
    });
    assert.deepEqual(restoreQueue({ tracks: [song(0), song(1)], order: [1, 1, 9, -1, 0.5], position: 7, time: "x" }), {
      tracks: [song(0), song(1)],
      order: [1],
      position: 0,
      time: 0,
    });
    assert.equal(restoreQueue({ tracks: [{ trackId: 1 }], order: [0], position: 0 }), null);
    assert.equal(restoreQueue({ tracks: [], order: [], position: 0 }), null);
    assert.equal(restoreQueue("nonsense"), null);
    assert.equal(restoreQueue(null), null);
    const long = Array.from({ length: LONGEST_QUEUE + 50 }, (_, n) => song(n));
    assert.equal(
      restoreQueue({ tracks: long, order: inOrder(long.length), position: 0 })?.tracks.length,
      LONGEST_QUEUE,
    );
  });

  it("counts a full song once half of it, or four minutes, has really been heard", () => {
    assert.equal(countsAsPlay(29, 60), false);
    assert.equal(countsAsPlay(30, 60), true);
    assert.equal(countsAsPlay(239, 600), false);
    assert.equal(countsAsPlay(240, 600), true);
    assert.equal(countsAsPlay(29, 29.9), false);
    assert.equal(countsAsPlay(100, Number.NaN), false);
  });

  it("only adds up time that was played, not jumped over", () => {
    assert.equal(heardStep(null, 5), 0);
    assert.equal(heardStep(10, 10.25), 0.25);
    assert.equal(heardStep(10, 45), 0);
    assert.equal(heardStep(45, 10), 0);
  });
});

describe("keyboard shortcuts", () => {
  const plain = { shift: false, other: false, repeat: false };

  it("maps space and the arrow keys to player actions", () => {
    assert.equal(shortcutFor(" ", plain), "toggle");
    assert.equal(shortcutFor("ArrowLeft", plain), "back");
    assert.equal(shortcutFor("ArrowRight", plain), "forward");
    assert.equal(shortcutFor("ArrowLeft", { ...plain, shift: true }), "previous");
    assert.equal(shortcutFor("ArrowRight", { ...plain, shift: true }), "next");
    assert.equal(shortcutFor("a", plain), null);
  });

  it("leaves shortcuts with other modifier keys to the browser", () => {
    assert.equal(shortcutFor(" ", { ...plain, other: true }), null);
    assert.equal(shortcutFor("ArrowLeft", { ...plain, other: true }), null);
  });

  it("does not repeat play/pause or song changes while a key is held, but keeps seeking", () => {
    assert.equal(shortcutFor(" ", { ...plain, repeat: true }), null);
    assert.equal(shortcutFor("ArrowRight", { shift: true, other: false, repeat: true }), null);
    assert.equal(shortcutFor("ArrowRight", { ...plain, repeat: true }), "forward");
  });

  it("keeps seeking inside the song", () => {
    assert.equal(seekTarget(10, 5, 30), 15);
    assert.equal(seekTarget(28, 5, 30), 30);
    assert.equal(seekTarget(3, -5, 30), 0);
    assert.equal(seekTarget(10, 5, Number.NaN), 15);
  });
});

describe("playing from a list", () => {
  it("starts with the chosen song and shuffles the rest", () => {
    assert.deepEqual(startingWith(2, [3, 0, 2, 1]), [2, 3, 0, 1]);
    assert.deepEqual(startingWith(0, [0, 1]), [0, 1]);
  });

  it("keeps long lists to the longest queue, starting at the chosen song", () => {
    assert.deepEqual(queueWindow(10, 4, 500), { from: 0, to: 10 });
    assert.deepEqual(queueWindow(1200, 100, 500), { from: 100, to: 600 });
    assert.deepEqual(queueWindow(1200, 1100, 500), { from: 700, to: 1200 });
  });

  it("remembers the album, and only links that stay on Soundscape", () => {
    const saved = restoreQueue({
      tracks: [
        { trackId: "a", title: "b", artist: "c", album: "Clayman", albumHref: "/album/in-flames-clayman" },
        { trackId: "d", title: "e", artist: "f", album: "Far", albumHref: "/music?album=al-far" },
      ],
      order: [0, 1],
      position: 0,
    });
    assert.equal(saved?.tracks[0].albumHref, "/album/in-flames-clayman");
    assert.equal(saved?.tracks[1].albumHref, "/music?album=al-far");
    assert.equal(
      restoreQueue({
        tracks: [{ trackId: "a", title: "b", artist: "c", album: "x", albumHref: "https://evil.example/" }],
        order: [0],
        position: 0,
      }),
      null,
    );
  });

  it("remembers songs that come straight from Navidrome", () => {
    const saved = restoreQueue({
      tracks: [
        { trackId: "air-la-femme-d-argent", title: "La femme d'argent", artist: "Air", songId: "nd-1", newSong: true },
      ],
      order: [0],
      position: 0,
    });
    assert.equal(saved?.tracks[0].songId, "nd-1");
    assert.equal(saved?.tracks[0].newSong, true);
    assert.equal(
      restoreQueue({
        tracks: [{ trackId: "a", title: "b", artist: "c", songId: "../rest/x" }],
        order: [0],
        position: 0,
      }),
      null,
    );
  });
});

describe("song length", () => {
  it("uses the length Navidrome reports when the audio doesn't know it", () => {
    assert.equal(songLength(200, 180), 200);
    assert.equal(songLength(Number.NaN, 180), 180);
    assert.equal(songLength(Number.POSITIVE_INFINITY, 180), 180);
    assert.equal(songLength(0, 180), 180);
    assert.ok(Number.isNaN(songLength(Number.NaN, undefined)));
    assert.ok(Number.isNaN(songLength(Number.NaN, -5)));
  });

  it("keeps the length when the queue is saved and restored", () => {
    const saved = restoreQueue({
      tracks: [
        { trackId: "t1", title: "One", artist: "A", duration: 245 },
        { trackId: "t2", title: "Two", artist: "A", duration: "long" },
        { trackId: "t3", title: "Three", artist: "A", duration: 999_999 },
      ],
      order: [0, 1, 2],
      position: 0,
    });
    assert.deepEqual(
      saved?.tracks.map((track) => track.duration),
      [245, undefined, undefined],
    );
  });
});

describe("lockScreenPosition", () => {
  it("tells the lock screen where the song is", () => {
    assert.deepEqual(lockScreenPosition(200, 30, 1), { duration: 200, position: 30, playbackRate: 1 });
  });

  it("keeps the position inside the song", () => {
    assert.equal(lockScreenPosition(200, 250, 1)?.position, 200);
    assert.equal(lockScreenPosition(200, -3, 1)?.position, 0);
    assert.equal(lockScreenPosition(200, Number.NaN, 1)?.position, 0);
  });

  it("says nothing while the length is unknown", () => {
    assert.equal(lockScreenPosition(Number.NaN, 10, 1), null);
    assert.equal(lockScreenPosition(Number.POSITIVE_INFINITY, 10, 1), null);
    assert.equal(lockScreenPosition(0, 0, 1), null);
  });

  it("never reports a stopped or odd speed", () => {
    assert.equal(lockScreenPosition(100, 1, 0)?.playbackRate, 1);
    assert.equal(lockScreenPosition(100, 1, 1.5)?.playbackRate, 1.5);
  });
});
