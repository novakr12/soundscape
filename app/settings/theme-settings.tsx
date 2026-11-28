"use client";

import { useEffect, useState } from "react";
import { DEFAULT_OPTIONS, type PlayerOptions, saveOptions, watchOptions } from "@/lib/player-options";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";

const LABELS: Record<ThemeMode, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export default function ThemeSettings() {
  const [options, setOptions] = useState<PlayerOptions>(DEFAULT_OPTIONS);

  useEffect(() => watchOptions(setOptions), []);

  function change(theme: ThemeMode) {
    const updated = { ...options, theme };
    setOptions(updated);
    saveOptions(updated);
  }

  return (
    <>
      <fieldset className="theme-choice">
        <legend className="sr-only">Theme</legend>
        {THEME_MODES.map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name="app-theme"
              value={mode}
              checked={options.theme === mode}
              onChange={() => change(mode)}
            />{" "}
            {LABELS[mode]}
          </label>
        ))}
      </fieldset>
      <p className="muted">
        Choose light mode, dark mode, or your device setting across Soundscape, including the desktop and Android apps
        when they are connected.
      </p>
    </>
  );
}
