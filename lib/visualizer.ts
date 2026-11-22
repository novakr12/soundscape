import type { VisualizerBounce, VisualizerStyle } from "./player-options";

export const REST = 0.15;
export const SPECTRUM_BINS = 128;
export const MIN_DECIBELS = -65;
export const MAX_DECIBELS = -14;

export const BOUNCE_PROFILES: Record<
  VisualizerBounce,
  { smoothing: number; exponent: number; gain: number; decay: number }
> = {
  gentle: { smoothing: 0.72, exponent: 1.9, gain: 0.93, decay: 0.74 },
  normal: { smoothing: 0.56, exponent: 1.65, gain: 0.99, decay: 0.64 },
  lively: { smoothing: 0.42, exponent: 1.45, gain: 1.05, decay: 0.52 },
  extreme: { smoothing: 0.25, exponent: 1.25, gain: 1.11, decay: 0.36 },
};

export function bandEdges(barCount: number): number[] {
  const edges = [0];
  for (let i = 1; i <= barCount; i++) {
    edges.push(Math.max(edges[i - 1] + 1, Math.min(SPECTRUM_BINS, Math.round(SPECTRUM_BINS ** (i / barCount)))));
  }
  edges[barCount] = SPECTRUM_BINS;
  return edges;
}

export function shapeSpectrum(
  bins: ArrayLike<number>,
  previous: number[],
  barCount: number,
  bounce: VisualizerBounce,
): number[] {
  const edges = bandEdges(barCount);
  const { exponent, gain, decay } = BOUNCE_PROFILES[bounce];
  return Array.from({ length: barCount }, (_, bar) => {
    let peak = 0;
    let sum = 0;
    for (let i = edges[bar]; i < edges[bar + 1]; i++) {
      const value = bins[i] ?? 0;
      peak = Math.max(peak, value);
      sum += value;
    }
    const heard = (peak * 0.72 + (sum / (edges[bar + 1] - edges[bar])) * 0.28) / 255;
    const tilt = 0.88 + 0.52 * (bar / (barCount - 1));
    const target = REST + (1 - REST) * Math.min(1, heard * gain * tilt) ** exponent;
    const before = previous[bar] ?? REST;
    const next = target >= before ? target : before * decay + target * (1 - decay);
    return next < REST + 0.015 ? REST : Number(next.toFixed(3));
  });
}

export function barTransform(style: VisualizerStyle, level: number) {
  const value = Number.isFinite(level) ? Math.min(1, Math.max(REST, level)) : REST;
  if (style !== "dots") return `scaleY(${value})`;
  const lift = value - REST;
  return `translateY(${(-lift * 14).toFixed(1)}px) scale(${(0.85 + lift * 0.5).toFixed(2)})`;
}
