import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { niceTicks, share, shownLabels } from "../lib/chart-scale";

describe("chart scale", () => {
  it("picks round steps", () => {
    assert.deepEqual(niceTicks(34), [0, 10, 20, 30, 40]);
    assert.deepEqual(niceTicks(8), [0, 2, 4, 6, 8]);
    assert.deepEqual(niceTicks(6), [0, 2, 4, 6]);
    assert.deepEqual(niceTicks(3), [0, 1, 2, 3]);
    assert.deepEqual(niceTicks(521), [0, 200, 400, 600]);
    assert.deepEqual(niceTicks(0), [0, 1]);
  });

  it("picks round steps for shares", () => {
    assert.deepEqual(niceTicks(0.75, 4, false), [0, 0.2, 0.4, 0.6, 0.8]);
    assert.deepEqual(niceTicks(0.091, 4, false), [0, 0.025, 0.05, 0.075, 0.1]);
  });

  it("spaces the labels under many bars", () => {
    assert.deepEqual(shownLabels(5), [true, true, true, true, true]);
    const thirty = shownLabels(30);
    assert.equal(thirty.filter(Boolean).length, 7);
    assert.equal(thirty[0], true);
    assert.equal(thirty[25], true);
    assert.equal(thirty[29], true);
    assert.equal(thirty[28], false);
    const twentyNine = shownLabels(29);
    assert.equal(twentyNine[28], true);
  });

  it("turns values into heights", () => {
    assert.equal(share(5, 10), 50);
    assert.equal(share(20, 10), 100);
    assert.equal(share(3, 0), 0);
  });
});
