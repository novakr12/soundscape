"use client";

import { useEffect, useState } from "react";
import { nativePort } from "@/lib/app-bridge";
import {
  CROSSFADE_CHOICES,
  DEFAULT_OPTIONS,
  type PlayerOptions,
  saveOptions,
  VISUALIZER_BAR_CHOICES,
  type VisualizerBarCount,
  type VisualizerBounce,
  type VisualizerStyle,
  watchOptions,
} from "@/lib/player-options";

export default function PlayerSettings() {
  const [options, setOptions] = useState<PlayerOptions>(DEFAULT_OPTIONS);

  const [readable, setReadable] = useState(true);

  useEffect(() => watchOptions(setOptions), []);
  useEffect(() => {
    const app = nativePort(window as Window & { soundscapeNative?: unknown });
    setReadable(app !== null || "captureStream" in HTMLMediaElement.prototype);
  }, []);

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
      <label>
        <input
          type="checkbox"
          checked={options.autoplay}
          onChange={(event) => change({ autoplay: event.target.checked })}
        />{" "}
        Keep playing similar music
      </label>
      <p className="muted">
        When a single song or the last song in your queue finishes, a radio based on it carries on. Albums and playlists
        play to the end first. Needs Navidrome.
      </p>
      <label>
        <input
          type="checkbox"
          checked={options.visualizer}
          onChange={(event) => change({ visualizer: event.target.checked })}
        />{" "}
        Show audio visualizer
      </label>
      <p className="muted">
        Draws bars that react to the music in the player and the desktop mini player. They stay still when your system
        asks for reduced motion, and during 30-second previews in a browser.
      </p>
      {options.visualizer && !readable && (
        <p className="muted" role="note">
          The visualizer can&apos;t read the audio here, so it stays hidden. It works in Chromium browsers, and in the
          desktop and Android apps when they are connected and play with their built-in player.
        </p>
      )}
      {options.visualizer && (
        <>
          <label>
            Visualizer style{" "}
            <select
              value={options.visualizerStyle}
              onChange={(event) => change({ visualizerStyle: event.target.value as VisualizerStyle })}
            >
              <option value="bars">Bars</option>
              <option value="wave">Wave (mirrored)</option>
              <option value="dots">Dots</option>
            </select>
          </label>
          <p className="muted">Bars rise from the bottom, a wave grows from the middle and dots jump.</p>
          <label>
            Visualizer bounciness{" "}
            <select
              value={options.visualizerBounce}
              onChange={(event) => change({ visualizerBounce: event.target.value as VisualizerBounce })}
            >
              <option value="gentle">Gentle</option>
              <option value="normal">Normal</option>
              <option value="lively">Lively</option>
              <option value="extreme">Extreme</option>
            </select>
          </label>
          <p className="muted">How high the beat throws them and how quickly they fall back.</p>
          <label>
            Visualizer bands{" "}
            <select
              value={options.visualizerBars}
              onChange={(event) => change({ visualizerBars: Number(event.target.value) as VisualizerBarCount })}
            >
              {VISUALIZER_BAR_CHOICES.map((count) => (
                <option key={count} value={count}>
                  {count} bands
                </option>
              ))}
            </select>
          </label>
          <p className="muted">More bands show more detail and take a little more room next to the song.</p>
        </>
      )}
    </>
  );
}
