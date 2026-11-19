import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cursorBox, hoveredIndex, samePlot, tooltipPlace } from "../lib/chart-hover";

const plot = { x: 40, y: 8, width: 600, height: 200 };

describe("chart hover", () => {
  it("finds the bar under the pointer", () => {
    assert.equal(hoveredIndex(plot, 30, false, 40, 100), 0);
    assert.equal(hoveredIndex(plot, 30, false, 61, 100), 1);
    assert.equal(hoveredIndex(plot, 30, false, 639.9, 100), 29);
    assert.equal(hoveredIndex(plot, 30, false, 30, 100), null);
    assert.equal(hoveredIndex(plot, 30, false, 700, 100), null);
    assert.equal(hoveredIndex(plot, 30, false, 100, 300), null);
    assert.equal(hoveredIndex(plot, 0, false, 100, 100), null);
  });

  it("finds the row under the pointer when bars lie down", () => {
    assert.equal(hoveredIndex(plot, 8, true, 100, 8), 0);
    assert.equal(hoveredIndex(plot, 8, true, 100, 207), 7);
    assert.equal(hoveredIndex(plot, 8, true, 100, 60), 2);
  });

  it("covers the hovered bar's slice", () => {
    assert.deepEqual(cursorBox(plot, 30, false, 2), { left: 80, top: 8, width: 20, height: 200 });
    assert.deepEqual(cursorBox(plot, 8, true, 1), { left: 40, top: 33, width: 600, height: 25 });
  });

  it("keeps the tooltip inside the chart", () => {
    assert.deepEqual(tooltipPlace(100, 50, 700, 240), { left: 112, top: 62, transform: "translate(0, 0)" });
    assert.deepEqual(tooltipPlace(600, 200, 700, 240), {
      left: 588,
      top: 188,
      transform: "translate(-100%, -100%)",
    });
  });

  it("notices when the plot area moves", () => {
    assert.equal(samePlot(null, plot), false);
    assert.equal(samePlot(plot, { ...plot }), true);
    assert.equal(samePlot(plot, { ...plot, width: 601 }), false);
  });
});
