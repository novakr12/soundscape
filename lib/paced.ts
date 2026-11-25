export type Paced<T> = {
  push: (value: T) => void;
  cancel: () => void;
};

export type PacerClock = {
  now: () => number;
  setTimeout: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

const DEFAULT_CLOCK: PacerClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
};

/** Throttle updates with leading and trailing delivery so live gestures emit every `waitMs` and settle on the final value. */
export function createPaced<T>(send: (value: T) => void, waitMs: number, clock: PacerClock = DEFAULT_CLOCK): Paced<T> {
  let lastSent = Number.NEGATIVE_INFINITY;
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (timer !== undefined) {
      clock.clearTimeout(timer);
      timer = undefined;
    }
    pending = null;
  };

  const flush = () => {
    timer = undefined;
    const queued = pending;
    pending = null;
    if (!queued) return;
    lastSent = clock.now();
    send(queued.value);
  };

  const push = (value: T) => {
    const now = clock.now();
    const remaining = waitMs - (now - lastSent);
    if (remaining <= 0) {
      cancel();
      lastSent = now;
      send(value);
      return;
    }
    pending = { value };
    if (timer === undefined) {
      timer = clock.setTimeout(flush, remaining);
    }
  };

  return { push, cancel };
}
