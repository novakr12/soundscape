import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatJobInterval } from "../lib/admin";

describe("formatJobInterval", () => {
  for (const [minutes, expected] of [
    [5, "every 5 min"],
    [10, "every 10 min"],
    [60, "every hour"],
    [120, "every 2 hours"],
    [360, "every 6 hours"],
    [90, "every 1 h 30 min"],
  ] as const) {
    it(`${minutes} min → ${expected}`, () => assert.equal(formatJobInterval(minutes), expected));
  }
});
