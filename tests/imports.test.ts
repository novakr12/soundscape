import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { durationMsOf, validDurationMs } from "../lib/imports";

describe("duration validation", () => {
  it("accepts positive durations within Postgres 32-bit int bounds", () => {
    assert.equal(validDurationMs(1), 1);
    assert.equal(validDurationMs(210_400.6), 210_401);
    assert.equal(validDurationMs(2_147_483_647), 2_147_483_647);
    assert.equal(durationMsOf({ duration_ms: 185_000 }), 185_000);
    assert.equal(durationMsOf({ duration: 185 }), 185_000);
  });

  it("rejects zero, negative, non-finite, and overflowing durations", () => {
    for (const bad of [0, -100, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648, 9_999_999_999_999, "nope"]) {
      assert.equal(validDurationMs(bad), undefined, String(bad));
    }
    assert.equal(durationMsOf({ duration_ms: 9_999_999_999_999 }), undefined);
    assert.equal(durationMsOf({ duration: 3_000_000 }), undefined);
    assert.equal(durationMsOf({ duration_ms: -5, duration: 120 }), 120_000);
  });
});
