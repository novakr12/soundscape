import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handBackStep, nudge, phoneTime } from "../lib/hand-back";

describe("taking the music back from the phone's player", () => {
  it("knows where the phone's player is now", () => {
    assert.equal(phoneTime(80, 1_000, 1_500), 80.5);
    assert.equal(phoneTime(80, 1_000, 900), 80);
  });

  it("nudges the speed gently and never too far", () => {
    assert.equal(nudge(0.01), 1);
    assert.equal(nudge(0.04), 1.05);
    assert.equal(nudge(0.4), 1.2);
    assert.equal(nudge(0.9), 1.25);
    assert.equal(nudge(-0.2), 0.9);
  });

  it("jumps when far off, nudges when close, and settles before unmuting", () => {
    const base = { rate: 1, settledFor: null, waited: 100 };
    assert.deepEqual(handBackStep({ ...base, expected: 82, current: 80 }), { kind: "jump", to: 82 });
    assert.deepEqual(handBackStep({ ...base, expected: 80.4, current: 80 }), { kind: "rate", rate: 1.2 });
    assert.deepEqual(handBackStep({ ...base, expected: 80.01, current: 80, rate: 1.05 }), { kind: "settle" });
    assert.deepEqual(handBackStep({ ...base, expected: 80.01, current: 80 }), { kind: "settle" });
    assert.deepEqual(handBackStep({ ...base, expected: 80.01, current: 80, settledFor: 100 }), { kind: "settle" });
    assert.deepEqual(handBackStep({ ...base, expected: 80.01, current: 80, settledFor: 300 }), { kind: "done" });
  });

  it("gives up waiting and plays anyway after a while", () => {
    assert.deepEqual(handBackStep({ expected: 90, current: 80, rate: 1, settledFor: null, waited: 7_000 }), {
      kind: "done",
    });
  });
});
