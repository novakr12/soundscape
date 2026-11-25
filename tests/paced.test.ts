import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPaced, type PacerClock } from "../lib/paced";

function fakeClock() {
  let time = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();

  const clock: PacerClock = {
    now: () => time,
    setTimeout: (run, ms) => {
      const id = nextId++;
      timers.set(id, { at: time + ms, run });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (id) => {
      timers.delete(id as unknown as number);
    },
  };

  const advance = (ms: number) => {
    const target = time + ms;
    while (true) {
      let soonest: [number, { at: number; run: () => void }] | null = null;
      for (const entry of timers.entries()) {
        if (entry[1].at <= target && (!soonest || entry[1].at < soonest[1].at)) {
          soonest = entry;
        }
      }
      if (!soonest) break;
      timers.delete(soonest[0]);
      time = soonest[1].at;
      soonest[1].run();
    }
    time = target;
  };

  return { clock, advance, pendingCount: () => timers.size };
}

describe("createPaced", () => {
  it("delivers the first push immediately even at t = 0", () => {
    const sent: number[] = [];
    const { clock } = fakeClock();
    const paced = createPaced<number>((value) => sent.push(value), 25, clock);

    paced.push(0.8);
    assert.deepEqual(sent, [0.8]);
  });

  it("emits intermediate updates during a continuous drag and finishes on the final value", () => {
    const sent: number[] = [];
    const { clock, advance } = fakeClock();
    const paced = createPaced<number>((value) => sent.push(value), 25, clock);

    paced.push(0.1);
    advance(10);
    paced.push(0.2);
    advance(10);
    paced.push(0.3);
    assert.deepEqual(sent, [0.1]);

    advance(5);
    assert.deepEqual(sent, [0.1, 0.3]);

    advance(10);
    paced.push(0.4);
    advance(10);
    paced.push(0);
    assert.deepEqual(sent, [0.1, 0.3]);

    advance(5);
    assert.deepEqual(sent, [0.1, 0.3, 0]);
  });

  it("drops queued trailing delivery when cancelled", () => {
    const sent: number[] = [];
    const { clock, advance, pendingCount } = fakeClock();
    const paced = createPaced<number>((value) => sent.push(value), 25, clock);

    paced.push(0.5);
    advance(5);
    paced.push(0.6);
    assert.equal(pendingCount(), 1);

    paced.cancel();
    assert.equal(pendingCount(), 0);
    advance(100);
    assert.deepEqual(sent, [0.5]);
  });
});
