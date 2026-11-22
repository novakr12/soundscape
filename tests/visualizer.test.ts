import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VISUALIZER_BAR_CHOICES, VISUALIZER_BOUNCES } from "../lib/player-options";
import { bandEdges, barTransform, REST, SPECTRUM_BINS, shapeSpectrum } from "../lib/visualizer";

describe("visualizer", () => {
  it("covers every bin once for each band choice", () => {
    for (const count of VISUALIZER_BAR_CHOICES) {
      const edges = bandEdges(count);
      assert.equal(edges.length, count + 1);
      assert.equal(edges.at(-1), SPECTRUM_BINS);
      for (let i = 1; i < edges.length; i++) assert.ok(edges[i] > edges[i - 1], `${count} bands: ${edges}`);
    }
  });

  it("rests in silence and raises only the band that is heard", () => {
    const bins = new Uint8Array(SPECTRUM_BINS);
    assert.deepEqual(shapeSpectrum(bins, [], 8, "lively"), Array(8).fill(REST));
    bins[0] = 255;
    const bars = shapeSpectrum(bins, [], 8, "lively");
    assert.ok(bars[0] > 0.85);
    assert.deepEqual(bars.slice(1), Array(7).fill(REST));
  });

  it("jumps higher and falls faster the bouncier it is", () => {
    const some = new Uint8Array(SPECTRUM_BINS).fill(120);
    const silent = new Uint8Array(SPECTRUM_BINS);
    const rises = VISUALIZER_BOUNCES.map((bounce) => shapeSpectrum(some, [], 6, bounce)[2]);
    const falls = VISUALIZER_BOUNCES.map((bounce) => shapeSpectrum(silent, Array(6).fill(1), 6, bounce)[2]);
    assert.deepEqual(
      rises,
      [...new Set(rises)].sort((a, b) => a - b),
    );
    assert.deepEqual(
      falls,
      [...new Set(falls)].sort((a, b) => b - a),
    );
  });

  it("moves dots, stretches the others and never passes on a bad number", () => {
    assert.equal(barTransform("bars", 0.5), "scaleY(0.5)");
    assert.equal(barTransform("wave", 4), "scaleY(1)");
    assert.match(barTransform("dots", 1), /^translateY\(-11\.9px\)/);
    assert.equal(barTransform("bars", Number.NaN), `scaleY(${REST})`);
  });
});
