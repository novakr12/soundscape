import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { measuredHeight, visibleRows } from "../lib/visible-rows";

describe("only the rows near the screen are drawn", () => {
  it("draws the top of a list that starts on screen", () => {
    assert.deepEqual(visibleRows({ count: 200, rowHeight: 60, listTop: 300, viewport: 900, spare: 10 }), {
      start: 0,
      end: 20,
    });
  });

  it("follows the list as it scrolls away", () => {
    assert.deepEqual(visibleRows({ count: 200, rowHeight: 60, listTop: -6000, viewport: 900, spare: 10 }), {
      start: 90,
      end: 125,
    });
  });

  it("stops at the end of the list", () => {
    assert.deepEqual(visibleRows({ count: 200, rowHeight: 60, listTop: -20000, viewport: 900, spare: 10 }), {
      start: 200,
      end: 200,
    });
    assert.deepEqual(visibleRows({ count: 0, rowHeight: 60, listTop: 0, viewport: 900, spare: 10 }), {
      start: 0,
      end: 0,
    });
  });

  it("learns the row height from the rows it drew, ignoring tiny changes", () => {
    assert.equal(measuredHeight(1240, 20, 56), 62);
    assert.equal(measuredHeight(1125, 20, 56), 56);
    assert.equal(measuredHeight(0, 0, 56), 56);
  });
});
