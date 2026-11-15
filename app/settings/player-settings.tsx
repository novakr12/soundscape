"use client";

import { useEffect, useState } from "react";
import {
  CROSSFADE_CHOICES,
  DEFAULT_OPTIONS,
  type PlayerOptions,
  saveOptions,
  watchOptions,
} from "@/lib/player-options";

export default function PlayerSettings() {
  const [options, setOptions] = useState<PlayerOptions>(DEFAULT_OPTIONS);

  useEffect(() => watchOptions(setOptions), []);

  function change(next: Partial<PlayerOptions>) {
    const updated = { ...options, ...next };
    setOptions(updated);
    saveOptions(updated);
  }

  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={options.levelling}
          onChange={(event) => change({ levelling: event.target.checked })}
        />{" "}
        Level the volume between songs
      </label>
      <p className="muted">
        Uses the ReplayGain loudness your Navidrome reads from your files, so a quiet album and a loud one play at about
        the same volume. A whole album keeps its own dynamics. Songs without ReplayGain tags and 30-second previews play
        as they are.
      </p>
      <label>
        Crossfade between songs{" "}
        <select value={options.crossfade} onChange={(event) => change({ crossfade: Number(event.target.value) })}>
          {CROSSFADE_CHOICES.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds === 0 ? "Off" : `${seconds} seconds`}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Fades one song into the next. Songs from the same album still follow each other without a gap, the way the album
        was made.
      </p>
    </>
  );
}
