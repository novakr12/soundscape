export const EQ_BAND_COUNT = 10;
export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;
export const EQ_STEP_DB = 0.5;

export type EqBands = [number, number, number, number, number, number, number, number, number, number];

export type EqualizerOptions = {
  enabled: boolean;
  bands: EqBands;
};

export type EqPreset = {
  id: string;
  name: string;
  bands: EqBands;
};

export const EQ_BANDS: readonly { hz: number; label: string; shortLabel: string }[] = [
  { hz: 29, label: "30 Hz", shortLabel: "30" },
  { hz: 59, label: "60 Hz", shortLabel: "60" },
  { hz: 119, label: "120 Hz", shortLabel: "120" },
  { hz: 237, label: "240 Hz", shortLabel: "240" },
  { hz: 474, label: "475 Hz", shortLabel: "475" },
  { hz: 947, label: "950 Hz", shortLabel: "950" },
  { hz: 1889, label: "1.9 kHz", shortLabel: "1.9k" },
  { hz: 3770, label: "3.8 kHz", shortLabel: "3.8k" },
  { hz: 7523, label: "7.5 kHz", shortLabel: "7.5k" },
  { hz: 15011, label: "15 kHz", shortLabel: "15k" },
];

export const FLAT_BANDS: EqBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export const DEFAULT_EQUALIZER: EqualizerOptions = {
  enabled: false,
  bands: FLAT_BANDS,
};

export const EQ_PRESETS: readonly EqPreset[] = [
  { id: "flat", name: "Flat", bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "bass-boost", name: "Bass Boost", bands: [5, 4.5, 3.5, 2, 0.5, 0, 0, 0, 0, 0] },
  { id: "treble-boost", name: "Treble Boost", bands: [0, 0, 0, 0, 0, 1, 2, 3.5, 4.5, 5] },
  { id: "vocal", name: "Vocal", bands: [-2, -1.5, -1, 1, 3, 3.5, 3, 1.5, 0, -1] },
  { id: "rock", name: "Rock", bands: [4, 3, 1.5, -0.5, -1.5, -0.5, 1.5, 3, 3.5, 4] },
  { id: "electronic", name: "Electronic", bands: [4.5, 3.5, 1.5, 0, -1.5, 1, 0.5, 1.5, 3.5, 4.5] },
  { id: "acoustic", name: "Acoustic", bands: [2.5, 2, 1, 0.5, 1.5, 1.5, 2.5, 2.5, 2, 1] },
  { id: "classical", name: "Classical", bands: [0, 0, 0, 0, 0, 0, -1.5, -2.5, -2.5, -3] },
  { id: "jazz", name: "Jazz", bands: [2.5, 2, 1, 1.5, -1, -1, 0, 1.5, 2.5, 3] },
  { id: "pop", name: "Pop", bands: [-1, 1.5, 3, 3.5, 2, 0, -1, -1, 1, 1.5] },
  { id: "late-night", name: "Late Night", bands: [3, 2.5, 1, 0, -0.5, -0.5, 0, 1, 1.5, 1] },
];

export function clampBandGain(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const clamped = Math.min(EQ_MAX_DB, Math.max(EQ_MIN_DB, value));
  const stepped = Math.round(clamped / EQ_STEP_DB) * EQ_STEP_DB;
  return stepped === 0 ? 0 : stepped;
}

export function readEqBands(raw: unknown): EqBands {
  if (!Array.isArray(raw) || raw.length < EQ_BAND_COUNT) return [...FLAT_BANDS];
  return [
    clampBandGain(raw[0]),
    clampBandGain(raw[1]),
    clampBandGain(raw[2]),
    clampBandGain(raw[3]),
    clampBandGain(raw[4]),
    clampBandGain(raw[5]),
    clampBandGain(raw[6]),
    clampBandGain(raw[7]),
    clampBandGain(raw[8]),
    clampBandGain(raw[9]),
  ];
}

export function readEqualizer(raw: unknown): EqualizerOptions {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { enabled: DEFAULT_EQUALIZER.enabled, bands: [...FLAT_BANDS] };
  }
  const entry = raw as Record<string, unknown>;
  return {
    enabled: entry.enabled === true,
    bands: readEqBands(entry.bands),
  };
}

export function presetForBands(bands: readonly number[]): string {
  const match = EQ_PRESETS.find((preset) =>
    preset.bands.every((gain, index) => Math.abs(gain - (bands[index] ?? 0)) < 0.01),
  );
  return match ? match.id : "custom";
}

export function formatDb(value: number): string {
  const clean = clampBandGain(value);
  if (clean === 0) return "0 dB";
  return `${clean > 0 ? "+" : ""}${clean} dB`;
}

export function eqCurvePoints(bands: readonly number[], width = 200, height = 44): string {
  const pad = 5;
  const usableWidth = width - pad * 2;
  const usableHeight = height - pad * 2;
  return EQ_BANDS.map((_, index) => {
    const x = pad + (usableWidth * index) / (EQ_BAND_COUNT - 1);
    const gain = clampBandGain(bands[index]);
    const normalized = (EQ_MAX_DB - gain) / (EQ_MAX_DB - EQ_MIN_DB);
    const y = pad + normalized * usableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}
