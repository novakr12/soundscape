export type Repeat = "off" | "all" | "one";

export const REPEAT_ORDER: Repeat[] = ["off", "all", "one"];

export function nextRepeat(repeat: Repeat): Repeat {
  return REPEAT_ORDER[(REPEAT_ORDER.indexOf(repeat) + 1) % REPEAT_ORDER.length];
}

function shuffle(items: number[], random: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function inOrder(length: number) {
  return Array.from({ length }, (_, i) => i);
}

export function shuffleAll(length: number, random = Math.random) {
  return shuffle(inOrder(length), random);
}

export function shuffleAfter(order: number[], position: number, random = Math.random) {
  return [...order.slice(0, position + 1), ...shuffle(order.slice(position + 1), random)];
}

export function unshuffle(order: number[], position: number) {
  return { order: inOrder(order.length), position: order[position] ?? 0 };
}

export function nextPosition(position: number, length: number, repeat: Repeat): number | null {
  if (position + 1 < length) return position + 1;
  return repeat === "all" && length > 0 ? 0 : null;
}
