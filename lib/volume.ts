export const VOLUME_STEP = 0.01;
export const VOLUME_KEY_STEP = 0.05;

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

/** Nudge volume by `delta` snapped to slider steps and clamped to `[0, 1]`. */
export function stepVolume(current: number, delta: number): number {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  const snapped = Math.round((safeCurrent + safeDelta) / VOLUME_STEP) * VOLUME_STEP;
  const clamped = Math.min(1, Math.max(0, snapped));
  return Number(clamped.toFixed(4));
}

/** Toggle mute while remembering the previous non-zero volume level. */
export function toggleMuteVolume(current: number, remembered: number): { volume: number; remembered: number } {
  const safeCurrent = Number.isFinite(current) ? Math.min(1, Math.max(0, current)) : 0;
  const safeRemembered = Number.isFinite(remembered) ? Math.min(1, Math.max(0, remembered)) : 0;
  if (safeCurrent > 0) return { volume: 0, remembered: safeCurrent };
  const restored = safeRemembered > 0 ? safeRemembered : 0.5;
  return { volume: restored, remembered: restored };
}
