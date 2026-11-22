"use client";

import { useEffect, useState } from "react";
import { ACCENT_PRESETS } from "@/lib/accent";
import { DEFAULT_OPTIONS, type PlayerOptions, saveOptions, watchOptions } from "@/lib/player-options";

export default function AccentSettings() {
  const [options, setOptions] = useState<PlayerOptions>(DEFAULT_OPTIONS);

  useEffect(() => watchOptions(setOptions), []);

  function choose(accent: string) {
    const updated = { ...options, accent: accent.toLowerCase() };
    setOptions(updated);
    saveOptions(updated);
  }

  return (
    <>
      <div className="accent-choices" role="radiogroup" aria-label="Accent color">
        {ACCENT_PRESETS.map((preset) => (
          <button
            key={preset.color}
            type="button"
            role="radio"
            aria-checked={options.accent === preset.color}
            aria-label={preset.name}
            title={preset.name}
            className="accent-swatch"
            style={{ background: preset.color }}
            onClick={() => choose(preset.color)}
          />
        ))}
        <label className="accent-custom">
          <input type="color" value={options.accent} onChange={(event) => choose(event.target.value)} /> Custom
        </label>
      </div>
      <p className="muted">
        Colors buttons, links, sliders, charts and the visualizer, here and in the desktop and Android apps when they
        are connected. Text on the color switches between black and white to stay readable.
      </p>
    </>
  );
}
