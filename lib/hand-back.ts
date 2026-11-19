const IN_STEP_SECONDS = 0.03;
const JUMP_ABOVE_SECONDS = 1;
const GENTLEST_NUDGE = 0.05;
const STRONGEST_NUDGE = 0.25;

export const HAND_BACK_STEP_MS = 50;
export const HAND_BACK_SETTLE_MS = 300;
export const HAND_BACK_WITHIN_MS = 6000;

export function phoneTime(time: number, at: number, now: number) {
  return time + Math.max(0, now - at) / 1000;
}

export function inStep(behind: number) {
  return Math.abs(behind) <= IN_STEP_SECONDS;
}

export function jumpNeeded(behind: number) {
  return Math.abs(behind) > JUMP_ABOVE_SECONDS;
}

export function nudge(behind: number) {
  if (inStep(behind)) return 1;
  const strength = Math.min(STRONGEST_NUDGE, Math.max(GENTLEST_NUDGE, Math.abs(behind) * 0.5));
  return Math.round((behind > 0 ? 1 + strength : 1 - strength) * 1000) / 1000;
}

export type HandBackStep =
  | { kind: "jump"; to: number }
  | { kind: "rate"; rate: number }
  | { kind: "settle" }
  | { kind: "done" };

export function handBackStep({
  expected,
  current,
  rate,
  settledFor,
  waited,
}: {
  expected: number;
  current: number;
  rate: number;
  settledFor: number | null;
  waited: number;
}): HandBackStep {
  if (waited > HAND_BACK_WITHIN_MS) return { kind: "done" };
  const behind = expected - current;
  if (jumpNeeded(behind)) return { kind: "jump", to: expected };
  if (!inStep(behind)) return { kind: "rate", rate: nudge(behind) };
  if (rate !== 1 || settledFor === null) return { kind: "settle" };
  return settledFor >= HAND_BACK_SETTLE_MS ? { kind: "done" } : { kind: "settle" };
}
