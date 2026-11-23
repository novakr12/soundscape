"use client";

import { useEffect, useState } from "react";
import { ACCENT_PRESETS } from "@/lib/accent";
import { nativePort } from "@/lib/app-bridge";
import { DEFAULT_OPTIONS, type PlayerOptions, saveOptions, watchOptions } from "@/lib/player-options";

export default function AccentSettings() {
  const [options, setOptions] = useState<PlayerOptions>(DEFAULT_OPTIONS);

  const [inApp, setInApp] = useState(false);

  useEffect(() => watchOptions(setOptions), []);
  useEffect(() => setInApp(nativePort(window as Window & { soundscapeNative?: unknown }) !== null), []);

  function change(next: Partial<PlayerOptions>) {
    const updated = { ...options, ...next };
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
            onClick={() => change({ accent: preset.color })}
          />
        ))}
        <label className="accent-custom">
          <input
            type="color"
            value={options.accent}
            onChange={(event) => change({ accent: event.target.value.toLowerCase() })}
          />{" "}
          Custom
        </label>
      </div>
      <p className="muted">
        Colors buttons, links, sliders, charts and the visualizer, here and in the desktop and Android apps when they
        are connected. Text on the color switches between black and white to stay readable.
      </p>
      {inApp && (
        <>
          <label>
            <input
              type="checkbox"
              checked={options.accentIcon}
              onChange={(event) => change({ accentIcon: event.target.checked })}
            />{" "}
            Color the app icon too
          </label>
          <p className="muted">
            On the desktop the window, tray and mini player icons take the color, wherever your desktop shows an
            app&apos;s own icon. On Android the home screen icon switches to the nearest preset color, which can take a
            moment and may move it on some launchers.
          </p>
        </>
      )}
    </>
  );
}
