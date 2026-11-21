export type PlayerOptions = { levelling: boolean; crossfade: number; autoplay: boolean };

export const CROSSFADE_CHOICES = [0, 2, 4, 6, 8, 12];

const KEY = "soundscape:player-options";
export const OPTIONS_CHANGED = "soundscape:player-options";

export const DEFAULT_OPTIONS: PlayerOptions = { levelling: true, crossfade: 0, autoplay: false };

export function readOptions(raw: unknown): PlayerOptions {
  if (typeof raw !== "object" || raw === null) return DEFAULT_OPTIONS;
  const saved = raw as Record<string, unknown>;
  return {
    levelling: typeof saved.levelling === "boolean" ? saved.levelling : DEFAULT_OPTIONS.levelling,
    crossfade:
      typeof saved.crossfade === "number" && CROSSFADE_CHOICES.includes(saved.crossfade)
        ? saved.crossfade
        : DEFAULT_OPTIONS.crossfade,
    autoplay: typeof saved.autoplay === "boolean" ? saved.autoplay : DEFAULT_OPTIONS.autoplay,
  };
}

export function loadOptions(): PlayerOptions {
  try {
    return readOptions(JSON.parse(window.localStorage.getItem(KEY) ?? "null"));
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export function saveOptions(options: PlayerOptions) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(options));
  } catch {}
  window.dispatchEvent(new Event(OPTIONS_CHANGED));
}

export function watchOptions(changed: (options: PlayerOptions) => void) {
  const update = () => changed(loadOptions());
  update();
  const fromOtherTab = (event: StorageEvent) => {
    if (event.key === KEY) update();
  };
  window.addEventListener(OPTIONS_CHANGED, update);
  window.addEventListener("storage", fromOtherTab);
  return () => {
    window.removeEventListener(OPTIONS_CHANGED, update);
    window.removeEventListener("storage", fromOtherTab);
  };
}
