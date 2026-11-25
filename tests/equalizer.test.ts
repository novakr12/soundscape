import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampBandGain,
  DEFAULT_EQUALIZER,
  EQ_BAND_COUNT,
  EQ_BANDS,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  eqCurvePoints,
  FLAT_BANDS,
  formatDb,
  presetForBands,
  readEqBands,
  readEqualizer,
} from "../lib/equalizer";

describe("equalizer helpers", () => {
  it("clamps band gains to [-12, +12], rounds to 0.5 dB, and avoids -0", () => {
    assert.equal(clampBandGain(0), 0);
    assert.equal(Object.is(clampBandGain(-0.1), 0), true);
    assert.equal(clampBandGain(20), EQ_MAX_DB);
    assert.equal(clampBandGain(-20), EQ_MIN_DB);
    assert.equal(clampBandGain(3.26), 3.5);
    assert.equal(clampBandGain(-3.26), -3.5);
    assert.equal(clampBandGain(Number.NaN), 0);
    assert.equal(clampBandGain(Number.POSITIVE_INFINITY), 0);
    assert.equal(clampBandGain("5"), 0);
  });

  it("reads 10-band arrays safely and falls back on malformed inputs", () => {
    assert.equal(EQ_BANDS.length, EQ_BAND_COUNT);
    assert.deepEqual(readEqBands(null), FLAT_BANDS);
    assert.deepEqual(readEqBands([1, 2, 3]), FLAT_BANDS);
    assert.deepEqual(
      readEqBands([-20, 1.24, "x", Number.NaN, 15, 0, -0.1, 2.74, -6, 12, 99]),
      [-12, 1, 0, 0, 12, 0, 0, 2.5, -6, 12],
    );
    assert.deepEqual(readEqualizer(null), DEFAULT_EQUALIZER);
    assert.deepEqual(readEqualizer({ enabled: "yes", bands: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }), {
      enabled: false,
      bands: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    });
    assert.deepEqual(readEqualizer({ enabled: true, bands: [2, 0, 0, 0, 0, 0, 0, 0, 0, -2] }), {
      enabled: true,
      bands: [2, 0, 0, 0, 0, 0, 0, 0, 0, -2],
    });
  });

  it("identifies matching presets or custom", () => {
    for (const preset of EQ_PRESETS) {
      assert.equal(presetForBands(preset.bands), preset.id);
    }
    assert.equal(presetForBands([5, 4, 3, 2, 1, 0, 0, 0, 0, 0]), "custom");
  });

  it("formats dB labels cleanly and maps SVG curve points", () => {
    assert.equal(formatDb(0), "0 dB");
    assert.equal(formatDb(-0.1), "0 dB");
    assert.equal(formatDb(3.5), "+3.5 dB");
    assert.equal(formatDb(4), "+4 dB");
    assert.equal(formatDb(-6), "-6 dB");

    const flatPoints = eqCurvePoints(FLAT_BANDS, 200, 44).split(" ");
    assert.equal(flatPoints.length, EQ_BAND_COUNT);
    assert.equal(flatPoints[0], "5.0,22.0");
    assert.equal(flatPoints[9], "195.0,22.0");

    const extreme = eqCurvePoints([12, 0, 0, 0, 0, 0, 0, 0, 0, -12], 200, 44).split(" ");
    assert.equal(extreme[0], "5.0,5.0");
    assert.equal(extreme[9], "195.0,39.0");
  });
});
