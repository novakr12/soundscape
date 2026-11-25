import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audioVolume, VOLUME_STEP, volumeGain } from "../lib/volume";

describe("volume scaling", () => {
  it("uses fine 1% slider steps", () => {
    assert.equal(VOLUME_STEP, 0.01);
  });

  it("maps slider positions onto a uniform cubic loudness curve", () => {
    assert.equal(volumeGain(0), 0);
    assert.equal(volumeGain(1), 1);
    assert.ok(Math.abs(volumeGain(0.05) - 0.000125) < 1e-12);
    for (const v of [0, 0.01, 0.05, 0.1, 0.25, 0.5, 0.8, 1]) {
      assert.ok(Math.abs(Math.cbrt(volumeGain(v)) - v) < 1e-12);
    }
  });

  it("clamps invalid and out-of-range slider inputs", () => {
    assert.equal(volumeGain(-0.2), 0);
    assert.equal(volumeGain(1.5), 1);
    assert.equal(volumeGain(Number.NaN), 0);
    assert.equal(volumeGain(Number.POSITIVE_INFINITY), 0);
    assert.equal(volumeGain(Number.NEGATIVE_INFINITY), 0);
  });

  it("applies linear ReplayGain levelling on top of curved volume", () => {
    assert.ok(Math.abs(audioVolume(0.8) - 0.512) < 1e-12);
    assert.ok(Math.abs(audioVolume(0.8, 0.5) - 0.512 * 0.5) < 1e-12);
    assert.ok(Math.abs(audioVolume(0.8, 1.5) - 0.512) < 1e-12);
    assert.equal(audioVolume(0.8, -0.3), 0);
    assert.equal(audioVolume(0.8, Number.NaN), 0);
    assert.equal(audioVolume(0.8, Number.POSITIVE_INFINITY), 0);
  });
});
