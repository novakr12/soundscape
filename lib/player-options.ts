import { DEFAULT_ACCENT, isAccent, paintAccent } from "./accent";

export const VISUALIZER_STYLES = ["bars", "wave", "dots"] as const;
export type VisualizerStyle = (typeof VISUALIZER_STYLES)[number];

export const VISUALIZER_BOUNCES = ["gentle", "normal", "lively", "extreme"] as const;
export type VisualizerBounce = (typeof VISUALIZER_BOUNCES)[number];

export const VISUALIZER_BAR_CHOICES = [4, 6, 8, 12] as const;
export type VisualizerBarCount = (typeof VISUALIZER_BAR_CHOICES)[number];

export type PlayerOptions = {
  levelling: boolean;
  crossfade: number;
  autoplay: boolean;
  visualizer: boolean;
  visualizerStyle: VisualizerStyle;
  visualizerBounce: VisualizerBounce;
  visualizerBars: VisualizerBarCount;
  accent: string;
  accentIcon: boolean;
};

export const CROSSFADE_CHOICES = [0, 2, 4, 6, 8, 12];

const KEY = "soundscape:player-options";
export const OPTIONS_CHANGED = "soundscape:player-options";

export const DEFAULT_OPTIONS: PlayerOptions = {
  levelling: true,
  crossfade: 0,
  autoplay: false,
  visualizer: true,
  visualizerStyle: "bars",
  visualizerBounce: "lively",
  visualizerBars: 8,
  accent: DEFAULT_ACCENT,
  accentIcon: false,
};

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
    visualizer: typeof saved.visualizer === "boolean" ? saved.visualizer : DEFAULT_OPTIONS.visualizer,
    visualizerStyle: (VISUALIZER_STYLES as readonly unknown[]).includes(saved.visualizerStyle)
      ? (saved.visualizerStyle as VisualizerStyle)
      : DEFAULT_OPTIONS.visualizerStyle,
    visualizerBounce: (VISUALIZER_BOUNCES as readonly unknown[]).includes(saved.visualizerBounce)
      ? (saved.visualizerBounce as VisualizerBounce)
      : DEFAULT_OPTIONS.visualizerBounce,
    visualizerBars: (VISUALIZER_BAR_CHOICES as readonly unknown[]).includes(saved.visualizerBars)
      ? (saved.visualizerBars as VisualizerBarCount)
      : DEFAULT_OPTIONS.visualizerBars,
    accent: isAccent(saved.accent) ? saved.accent.toLowerCase() : DEFAULT_OPTIONS.accent,
    accentIcon: typeof saved.accentIcon === "boolean" ? saved.accentIcon : DEFAULT_OPTIONS.accentIcon,
  };
}

export const ACCENT_SCRIPT = `try{(${paintAccent.toString()})(JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})||"null")?.accent,document.documentElement)}catch{}`;

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
