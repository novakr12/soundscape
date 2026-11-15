"use client";

import { type RefObject, useEffect, useState } from "react";
import { PauseIcon, PlayIcon } from "./player-icons";

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

function useAudio(
  audio: RefObject<HTMLAudioElement | null>,
  events: string[],
  read: (element: HTMLAudioElement) => number,
) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const follow = () => setValue(read(element));
    follow();
    for (const event of events) element.addEventListener(event, follow);
    return () => {
      for (const event of events) element.removeEventListener(event, follow);
    };
  }, [audio, events, read]);
  return value;
}

const PLAY_EVENTS = ["play", "pause", "playing", "ended", "emptied"];
const readPaused = (element: HTMLAudioElement) => (element.paused ? 1 : 0);
const LOAD_EVENTS = [
  "loadstart",
  "waiting",
  "stalled",
  "canplay",
  "playing",
  "pause",
  "emptied",
  "loadeddata",
  "error",
];
const readLoading = (element: HTMLAudioElement) =>
  !element.paused && !element.error && element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ? 1 : 0;
const TIME_EVENTS = ["timeupdate", "seeking", "emptied", "loadedmetadata"];
const readTime = (element: HTMLAudioElement) => element.currentTime;
const LENGTH_EVENTS = ["durationchange", "loadedmetadata", "emptied"];
const readLength = (element: HTMLAudioElement) => (Number.isFinite(element.duration) ? element.duration : 0);

export function PlayPauseButton({ audio }: { audio: RefObject<HTMLAudioElement | null> }) {
  const paused = useAudio(audio, PLAY_EVENTS, readPaused) === 1;
  const loading = useAudio(audio, LOAD_EVENTS, readLoading) === 1;
  return (
    <button
      type="button"
      className={loading ? "player-play loading" : "player-play"}
      aria-busy={loading}
      data-player="play"
      aria-label={paused ? "Play" : "Pause"}
      title={paused ? "Play (Space)" : "Pause (Space)"}
      onClick={() => {
        const element = audio.current;
        if (!element) return;
        if (element.paused) element.play().catch(() => {});
        else element.pause();
      }}
    >
      {paused ? <PlayIcon size={22} /> : <PauseIcon size={22} />}
    </button>
  );
}

export function SeekBar({ audio }: { audio: RefObject<HTMLAudioElement | null> }) {
  const time = useAudio(audio, TIME_EVENTS, readTime);
  const length = useAudio(audio, LENGTH_EVENTS, readLength);
  const at = length > 0 ? Math.min(time, length) : 0;
  return (
    <div className="player-seek">
      <span className="player-time">{clock(at)}</span>
      <input
        type="range"
        min={0}
        max={length || 1}
        step={0.1}
        value={at}
        disabled={length === 0}
        aria-label="Seek"
        aria-valuetext={`${clock(at)} of ${clock(length)}`}
        style={{ "--fill": `${length > 0 ? (at / length) * 100 : 0}%` } as React.CSSProperties}
        onChange={(event) => {
          if (audio.current) audio.current.currentTime = Number(event.target.value);
        }}
      />
      <span className="player-time">{clock(length)}</span>
    </div>
  );
}
