"use client";

import { type CSSProperties, useEffect, useState } from "react";
import {
  clampBandGain,
  EQ_BANDS,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  EQ_STEP_DB,
  type EqBands,
  type EqualizerOptions,
  eqCurvePoints,
  FLAT_BANDS,
  formatDb,
  presetForBands,
} from "@/lib/equalizer";

export default function EqualizerSettings({
  equalizer,
  onChange,
}: {
  equalizer: EqualizerOptions;
  onChange: (next: EqualizerOptions) => void;
}) {
  const [nativeEq, setNativeEq] = useState(false);

  useEffect(() => {
    setNativeEq(Boolean((window as Window & { soundscapeNativeEq?: boolean }).soundscapeNativeEq));
  }, []);

  const activePreset = presetForBands(equalizer.bands);
  const curvePoints = eqCurvePoints(equalizer.bands);

  function setBand(index: number, raw: number) {
    const nextBands = [...equalizer.bands] as EqBands;
    nextBands[index] = clampBandGain(raw);
    onChange({ ...equalizer, bands: nextBands });
  }

  function applyPreset(id: string) {
    const preset = EQ_PRESETS.find((candidate) => candidate.id === id);
    if (!preset) return;
    onChange({ ...equalizer, bands: [...preset.bands] as EqBands });
  }

  function resetFlat() {
    onChange({ ...equalizer, bands: [...FLAT_BANDS] as EqBands });
  }

  return (
    <div className="eq-section">
      <label>
        <input
          type="checkbox"
          checked={equalizer.enabled}
          onChange={(event) => onChange({ ...equalizer, enabled: event.target.checked })}
        />{" "}
        Enable 10-band equalizer
      </label>
      <p className="muted" role={nativeEq ? undefined : "note"}>
        {nativeEq
          ? "Shapes audio live across 10 frequency bands in the built-in desktop player."
          : "Applies to the desktop app's built-in player. Your preset and band settings are saved here and take effect automatically on desktop."}
      </p>
      {equalizer.enabled && (
        <div className="eq-panel">
          <div className="eq-toolbar">
            <label>
              Preset{" "}
              <select
                aria-label="Equalizer preset"
                value={activePreset}
                onChange={(event) => applyPreset(event.target.value)}
              >
                {EQ_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
                {activePreset === "custom" && (
                  <option value="custom" disabled>
                    Custom
                  </option>
                )}
              </select>
            </label>
            <button type="button" className="secondary" disabled={activePreset === "flat"} onClick={resetFlat}>
              Reset
            </button>
          </div>
          <svg className="eq-curve" viewBox="0 0 200 44" aria-hidden="true" preserveAspectRatio="none">
            <line x1="5" y1="22" x2="195" y2="22" className="eq-zero-line" />
            <polygon points={`5,22 ${curvePoints} 195,22`} className="eq-curve-fill" />
            <polyline points={curvePoints} className="eq-curve-line" />
          </svg>
          <div className="eq-rack" role="group" aria-label="Frequency bands">
            {EQ_BANDS.map((band, index) => {
              const gain = equalizer.bands[index] ?? 0;
              const pct = ((gain - EQ_MIN_DB) / (EQ_MAX_DB - EQ_MIN_DB)) * 100;
              const lo = gain >= 0 ? 50 : pct;
              const hi = gain >= 0 ? pct : 50;
              return (
                <div key={band.hz} className="eq-band">
                  <span className="eq-freq">{band.label}</span>
                  <div className="eq-slider-wrap">
                    <span className="eq-center-tick" aria-hidden="true" />
                    <input
                      type="range"
                      min={EQ_MIN_DB}
                      max={EQ_MAX_DB}
                      step={EQ_STEP_DB}
                      value={gain}
                      aria-label={`${band.label} equalizer band`}
                      aria-valuetext={formatDb(gain)}
                      style={{ "--fill": `${pct}%`, "--eq-lo": `${lo}%`, "--eq-hi": `${hi}%` } as CSSProperties}
                      onChange={(event) => setBand(index, Number(event.target.value))}
                    />
                  </div>
                  <button
                    type="button"
                    className="eq-gain"
                    title="Reset band to 0 dB"
                    aria-label={`Reset ${band.label} band to 0 dB`}
                    disabled={gain === 0}
                    onClick={() => setBand(index, 0)}
                  >
                    {formatDb(gain)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
