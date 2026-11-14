import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countsAsPlay,
  heardStep,
  inOrder,
  insertAfter,
  LONGEST_QUEUE,
  nextPosition,
  nextRepeat,
  removeAt,
  restoreQueue,
  shuffleAfter,
  shuffleAll,
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
