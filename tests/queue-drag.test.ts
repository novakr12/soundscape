import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inOrder, moveAt } from "../lib/play-queue";
import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_PX,
  autoScrollStep,
  DRAG_THRESHOLD_PX,
  dropSlotForY,
  indicatorForSlot,
  type QueueRowRect,
  targetIndexForSlot,
} from "../lib/queue-drag";

const SAMPLE_ROWS: QueueRowRect[] = [
  { index: 1, top: 100, bottom: 140 },
  { index: 2, top: 140, bottom: 180 },
  { index: 3, top: 180, bottom: 220 },
  { index: 4, top: 220, bottom: 260 },
];

describe("queue drag helpers", () => {
  it("exports positive threshold and auto-scroll defaults", () => {
    assert.ok(DRAG_THRESHOLD_PX > 0);
    assert.ok(AUTO_SCROLL_EDGE_PX > 0);
    assert.ok(AUTO_SCROLL_MAX_PX > 0);
  });

  describe("dropSlotForY", () => {
    it("returns null when there are no eligible rows or bounds are invalid", () => {
      assert.equal(dropSlotForY([], 150, 1, 4), null);
      assert.equal(dropSlotForY(SAMPLE_ROWS, 150, 5, 4), null);
      assert.equal(dropSlotForY([{ index: 0, top: 60, bottom: 100 }], 80, 1, 4), null);
    });

    it("returns minIndex when clientY is above the first eligible row midpoint", () => {
      assert.equal(dropSlotForY(SAMPLE_ROWS, 20, 1, 4), 1);
      assert.equal(dropSlotForY(SAMPLE_ROWS, 100, 1, 4), 1);
      assert.equal(dropSlotForY(SAMPLE_ROWS, 119.9, 1, 4), 1);
    });

    it("splits each row at its vertical midpoint", () => {
      assert.equal(dropSlotForY(SAMPLE_ROWS, 120, 1, 4), 2);
      assert.equal(dropSlotForY(SAMPLE_ROWS, 159.9, 1, 4), 2);
      assert.equal(dropSlotForY(SAMPLE_ROWS, 160, 1, 4), 3);
      assert.equal(dropSlotForY(SAMPLE_ROWS, 200, 1, 4), 4);
    });

    it("returns lastRow.index + 1 clamped to maxIndex + 1 below the last midpoint", () => {
      assert.equal(dropSlotForY(SAMPLE_ROWS, 240, 1, 4), 5);
      assert.equal(dropSlotForY(SAMPLE_ROWS, 400, 1, 4), 5);
      assert.equal(dropSlotForY(SAMPLE_ROWS, 400, 1, 3), 4);
    });

    it("handles virtualized row slices cleanly", () => {
      const virtualRows: QueueRowRect[] = [
        { index: 10, top: 100, bottom: 140 },
        { index: 11, top: 140, bottom: 180 },
        { index: 12, top: 180, bottom: 220 },
        { index: 15, top: 220, bottom: 260 },
      ];
      assert.equal(dropSlotForY(virtualRows, 110, 1, 30), 10);
      assert.equal(dropSlotForY(virtualRows, 150, 1, 30), 11);
      assert.equal(dropSlotForY(virtualRows, 250, 1, 30), 16);
    });
  });

  describe("targetIndexForSlot", () => {
    it("treats dropping in the song's own adjacent slots as a no-op", () => {
      assert.equal(targetIndexForSlot(2, 2, 1, 4), 2);
      assert.equal(targetIndexForSlot(2, 3, 1, 4), 2);
    });

    it("maps downward and upward drop slots to move indices", () => {
      assert.equal(targetIndexForSlot(1, 3, 1, 4), 2);
      assert.equal(targetIndexForSlot(1, 5, 1, 4), 4);
      assert.equal(targetIndexForSlot(4, 1, 1, 4), 1);
      assert.equal(targetIndexForSlot(4, 3, 1, 4), 3);
      assert.equal(targetIndexForSlot(2, 99, 1, 4), 4);
      assert.equal(targetIndexForSlot(3, 0, 1, 4), 1);
    });

    it("integrates end-to-end with moveAt from play-queue", () => {
      const base = inOrder(5);
      const downMid = moveAt(base, 0, 1, targetIndexForSlot(1, 3, 1, 4));
      assert.deepEqual(downMid.order, [0, 2, 1, 3, 4]);

      const downEnd = moveAt(base, 0, 1, targetIndexForSlot(1, 5, 1, 4));
      assert.deepEqual(downEnd.order, [0, 2, 3, 4, 1]);

      const upTop = moveAt(base, 0, 4, targetIndexForSlot(4, 1, 1, 4));
      assert.deepEqual(upTop.order, [0, 4, 1, 2, 3]);

      const upMid = moveAt(base, 0, 4, targetIndexForSlot(4, 3, 1, 4));
      assert.deepEqual(upMid.order, [0, 1, 2, 4, 3]);
    });
  });

  describe("indicatorForSlot", () => {
    it("returns null for null or no-op adjacent slots", () => {
      assert.equal(indicatorForSlot(2, null, 4), null);
      assert.equal(indicatorForSlot(2, 2, 4), null);
      assert.equal(indicatorForSlot(2, 3, 4), null);
    });

    it("renders above on rows inside the rendered slice and below on the last row", () => {
      assert.deepEqual(indicatorForSlot(1, 3, 4), { index: 3, edge: "above" });
      assert.deepEqual(indicatorForSlot(1, 4, 4), { index: 4, edge: "above" });
      assert.deepEqual(indicatorForSlot(1, 5, 4), { index: 4, edge: "below" });
      assert.deepEqual(indicatorForSlot(4, 1, 4), { index: 1, edge: "above" });
    });
  });

  describe("autoScrollStep", () => {
    it("returns 0 inside the safe middle band or with invalid bounds", () => {
      assert.equal(autoScrollStep(250, 100, 400, 40, 14), 0);
      assert.equal(autoScrollStep(140, 100, 400, 40, 14), 0);
      assert.equal(autoScrollStep(360, 100, 400, 40, 14), 0);
      assert.equal(autoScrollStep(200, 400, 400, 40, 14), 0);
      assert.equal(autoScrollStep(200, 400, 300, 40, 14), 0);
    });

    it("scrolls up smoothly near or above the top edge", () => {
      const gentle = autoScrollStep(130, 100, 400, 40, 14);
      const strong = autoScrollStep(105, 100, 400, 40, 14);
      const clamped = autoScrollStep(40, 100, 400, 40, 14);
      assert.ok(gentle < 0 && gentle > strong);
      assert.ok(strong >= -14);
      assert.equal(clamped, -14);
    });

    it("scrolls down smoothly near or below the bottom edge", () => {
      const gentle = autoScrollStep(370, 100, 400, 40, 14);
      const strong = autoScrollStep(395, 100, 400, 40, 14);
      const clamped = autoScrollStep(460, 100, 400, 40, 14);
      assert.ok(gentle > 0 && gentle < strong);
      assert.ok(strong <= 14);
      assert.equal(clamped, 14);
    });
  });
});
