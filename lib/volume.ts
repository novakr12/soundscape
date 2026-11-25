export const VOLUME_STEP = 0.01;

/** Convert a uniform UI slider position in `[0, 1]` to a cubic perceptual audio amplitude. */
export function volumeGain(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  const clamped = Math.min(1, Math.max(0, volume));
  return clamped * clamped * clamped;
}

/** Combine perceptual slider volume with linear track gain levelling into a `[0, 1]` element volume. */
export function audioVolume(volume: number, level = 1): number {
  if (!Number.isFinite(level)) return 0;
  const clampedLevel = Math.min(1, Math.max(0, level));
  return Math.min(1, Math.max(0, volumeGain(volume) * clampedLevel));
}
