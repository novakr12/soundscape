import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inOrder, nextPosition, nextRepeat, shuffleAfter, shuffleAll, unshuffle } from "../lib/play-queue";

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
});
