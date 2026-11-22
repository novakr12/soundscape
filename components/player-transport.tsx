"use client";

import { type RefObject, useEffect, useState } from "react";
import { songLength } from "@/lib/play-queue";
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

const REFRESH_MS = 250;
const RUN_EVENTS = ["play", "playing", "pause", "ended", "emptied"];

function whilePlaying(audio: RefObject<HTMLAudioElement | null>, follow: () => void, events: string[]) {
  let timer: ReturnType<typeof setInterval> | undefined;
  const arm = () => {
    const element = audio.current;
    const wanted = Boolean(element && !element.paused && !element.ended && !document.hidden);
    if (wanted && timer === undefined) timer = setInterval(follow, REFRESH_MS);
    if (!wanted && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  const heard = () => {
    follow();
    arm();
  };
  heard();
  const all = [...new Set([...events, ...RUN_EVENTS])];
  for (const event of all) document.addEventListener(event, heard, true);
  document.addEventListener("visibilitychange", heard);
  return () => {
    clearInterval(timer);
    for (const event of all) document.removeEventListener(event, heard, true);
    document.removeEventListener("visibilitychange", heard);
  };
}

const PLAY_STATE_EVENTS = [
  "play",
  "pause",
  "playing",
  "ended",
  "emptied",
  "loadstart",
  "waiting",
  "stalled",
  "canplay",
  "loadeddata",
  "error",
  "timeupdate",
];

const SEEK_EVENTS = ["timeupdate", "seeking", "emptied", "loadedmetadata", "durationchange"];
const STILL_AFTER_MS = 600;

export function PlayPauseButton({ audio }: { audio: RefObject<HTMLAudioElement | null> }) {
  const [{ paused, loading }, setState] = useState({ paused: true, loading: false });

  useEffect(() => {
    let last: { element: HTMLAudioElement | null; time: number; movedAt: number } = {
      element: null,
      time: -1,
      movedAt: 0,
    };
    const follow = () => {
      const element = audio.current;
      const nextPaused = element ? element.paused : true;
      let nextLoading = false;
      if (!element || element.paused || element.error) {
        last = { element, time: -1, movedAt: 0 };
      } else {
        const now = performance.now();
        if (last.element !== element) last = { element, time: element.currentTime, movedAt: 0 };
        else if (element.currentTime !== last.time) last = { element, time: element.currentTime, movedAt: now };
        const moving = now - last.movedAt < STILL_AFTER_MS;
        nextLoading = !moving && element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
      }
      setState((current) =>
        current.paused === nextPaused && current.loading === nextLoading
          ? current
          : { paused: nextPaused, loading: nextLoading },
      );
    };
    return whilePlaying(audio, follow, PLAY_STATE_EVENTS);
  }, [audio]);

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

export function SeekBar({ audio, known }: { audio: RefObject<HTMLAudioElement | null>; known?: number }) {
  const [{ time, rawLength }, setState] = useState({ time: 0, rawLength: 0 });

  useEffect(() => {
    const follow = () => {
      const element = audio.current;
      const nextTime = element ? element.currentTime : 0;
      const nextRawLength = element && Number.isFinite(element.duration) ? element.duration : 0;
      setState((current) =>
        current.time === nextTime && current.rawLength === nextRawLength
          ? current
          : { time: nextTime, rawLength: nextRawLength },
      );
    };
    return whilePlaying(audio, follow, SEEK_EVENTS);
  }, [audio]);

  const length = songLength(rawLength, known) || 0;
  const at = length > 0 ? Math.min(time, length) : time;
  return (
    <div className="player-seek">
      <span className="player-time">{clock(at)}</span>
      <input
        type="range"
        min={0}
        max={length || 1}
        step="any"
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
