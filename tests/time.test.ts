import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatListeningTime, formatTimeAgo, localWeekdayHour } from "../lib/time";

describe("formatTimeAgo", () => {
  const now = new Date("2026-10-24T12:00:00Z");
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

  for (const [minutes, expected] of [
    [0, "just now"],
    [1, "1 min ago"],
    [59, "59 min ago"],
    [60, "1 h ago"],
    [23 * 60 + 59, "23 h ago"],
  ] as const) {
    it(`${minutes} minutes → ${expected}`, () => assert.equal(formatTimeAgo(ago(minutes), now), expected));
  }

  it("shows the date and time after a day", () => {
    assert.equal(formatTimeAgo(ago(24 * 60), now), "2026-10-23 14:00");
  });
});

describe("formatListeningTime", () => {
  for (const [minutes, expected] of [
    [0, "0 min"],
    [42, "42 min"],
    [60, "1 h"],
    [205, "3 h 25 min"],
    [99 * 60 + 59, "99 h 59 min"],
    [1234 * 60 + 30, "1,234 h"],
  ] as const) {
    it(`${minutes} minutes → ${expected}`, () => assert.equal(formatListeningTime(minutes * 60_000), expected));
  }
});

describe("localWeekdayHour", () => {
  for (const [utc, expected] of [
    ["2026-10-23T19:30:00Z", { weekday: 4, hour: 21 }],
    ["2026-10-26T00:30:00Z", { weekday: 0, hour: 1 }],
    ["2026-01-04T23:30:00Z", { weekday: 0, hour: 0 }],
    ["2026-07-05T12:00:00Z", { weekday: 6, hour: 14 }],
  ] as const) {
    it(`${utc} is weekday ${expected.weekday}, hour ${expected.hour} in Belgrade`, () =>
      assert.deepEqual(localWeekdayHour(new Date(utc)), expected));
  }
});
