"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { nativePort } from "@/lib/app-bridge";
import { songLength } from "@/lib/play-queue";
import { DEFAULT_OPTIONS, type PlayerOptions, watchOptions } from "@/lib/player-options";
import {
  BOUNCE_PROFILES,
  barTransform,
  glide,
  MAX_DECIBELS,
  MIN_DECIBELS,
  REST,
  SPECTRUM_BINS,
  shapeSpectrum,
} from "@/lib/visualizer";
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

const RETAP_MS = 1000;

type Capturable = HTMLAudioElement & { captureStream?: () => MediaStream };

type Tap = {
  stream: MediaStream;
  analyser: AnalyserNode;
  track?: MediaStreamTrack;
  source?: MediaStreamAudioSourceNode;
};

let sharedContext: AudioContext | null = null;
const taps = new WeakMap<HTMLAudioElement, Tap>();

function canTap() {
  return "captureStream" in HTMLMediaElement.prototype && typeof AudioContext !== "undefined";
}

function tapFor(element: Capturable, context: AudioContext): Tap | null {
  const known = taps.get(element);
  if (known) return known;
  try {
    const stream = element.captureStream?.();
    if (!stream) return null;
    const analyser = context.createAnalyser();
    analyser.fftSize = SPECTRUM_BINS * 2;
    analyser.minDecibels = MIN_DECIBELS;
    analyser.maxDecibels = MAX_DECIBELS;
    const tap = { stream, analyser };
    taps.set(element, tap);
    return tap;
  } catch {
    return null;
  }
}

function followNewestTrack(tap: Tap, context: AudioContext) {
  const tracks = tap.stream.getAudioTracks();
  const newest = tracks.at(-1);
  for (const old of tracks.slice(0, -1)) {
    old.stop();
    tap.stream.removeTrack(old);
  }
  if (newest === tap.track) return;
  tap.source?.disconnect();
  tap.track = newest;
  tap.source = newest ? context.createMediaStreamSource(new MediaStream([newest])) : undefined;
  tap.source?.connect(tap.analyser);
}

function watchElement(element: HTMLAudioElement, options: PlayerOptions, paint: (levels: number[]) => void) {
  sharedContext ??= new AudioContext();
  const context = sharedContext;
  const wake = () => context.resume().catch(() => {});
  wake();
  document.addEventListener("pointerdown", wake);
  const bins = new Uint8Array(SPECTRUM_BINS);
  let tap: Tap | null = null;
  let triedAt = Number.NEGATIVE_INFINITY;
  let levels: number[] = [];
  let last = 0;
  let frame = requestAnimationFrame(function tick(now) {
    frame = requestAnimationFrame(tick);
    if (now - last < 36) return;
    last = now;
    if (!tap) {
      if (now - triedAt < RETAP_MS) return;
      triedAt = now;
      tap = tapFor(element, context);
      if (!tap) return;
      tap.analyser.smoothingTimeConstant = BOUNCE_PROFILES[options.visualizerBounce].smoothing;
    }
    followNewestTrack(tap, context);
    tap.analyser.getByteFrequencyData(bins);
    levels = shapeSpectrum(bins, levels, options.visualizerBars, options.visualizerBounce);
    paint(levels);
  });
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener("pointerdown", wake);
    context.suspend().catch(() => {});
  };
}

function watchApp(options: PlayerOptions, paint: (levels: number[]) => void) {
  let levels: number[] = [];
  const onLevels = (event: Event) => {
    const sent = (event as CustomEvent<unknown>).detail;
    paint(Array.isArray(sent) ? sent : []);
  };
  const onBins = (event: Event) => {
    const sent = (event as CustomEvent<unknown>).detail;
    if (!Array.isArray(sent) || sent.length !== SPECTRUM_BINS) return;
    levels = shapeSpectrum(sent, levels, options.visualizerBars, options.visualizerBounce);
    paint(levels);
  };
  const port = nativePort(window as Window & { soundscapeNative?: unknown });
  const ask = (on: boolean) => {
    try {
      port?.postMessage(JSON.stringify({ do: "visualizer", on }));
    } catch {}
  };
  window.addEventListener("soundscape-spectrum", onLevels);
  window.addEventListener("soundscape-spectrum-bins", onBins);
  ask(true);
  return () => {
    window.removeEventListener("soundscape-spectrum", onLevels);
    window.removeEventListener("soundscape-spectrum-bins", onBins);
    ask(false);
  };
}

export function PlayerVisualizer({
  audio,
  playing = false,
}: {
  audio?: RefObject<HTMLAudioElement | null>;
  playing?: boolean;
}) {
  const [options, setOptions] = useState<PlayerOptions>(DEFAULT_OPTIONS);
  const [element, setElement] = useState<HTMLAudioElement | null>(null);
  const [readable, setReadable] = useState(false);
  const [still, setStill] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);

  useEffect(() => watchOptions(setOptions), []);
  useEffect(() => setReadable(!audio || canTap()), [audio]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(reduced.matches);
    update();
    reduced.addEventListener("change", update);
    return () => reduced.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!audio) return;
    const follow = () => {
      const now = audio.current;
      setElement(now && !now.paused && !now.ended && !now.error && !document.hidden ? now : null);
    };
    return whilePlaying(audio, follow, PLAY_STATE_EVENTS);
  }, [audio]);

  const shown = readable && options.visualizer;
  const active = audio ? element !== null : playing;

  useEffect(() => {
    if (!shown || !active || still) return;
    const bars = [...(holder.current?.children ?? [])] as HTMLElement[];
    const shownLevels = bars.map(() => REST);
    let target: number[] = [];
    let frame = 0;
    let last = 0;
    const draw = (now: number) => {
      const moving = glide(shownLevels, target, last ? Math.min(now - last, 100) : 16);
      bars.forEach((bar, at) => {
        bar.style.transform = barTransform(options.visualizerStyle, shownLevels[at]);
      });
      last = now;
      frame = moving ? requestAnimationFrame(draw) : 0;
      if (!moving) last = 0;
    };
    const paint = (levels: number[]) => {
      target = levels;
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const stop = element ? watchElement(element, options, paint) : watchApp(options, paint);
    return () => {
      stop();
      cancelAnimationFrame(frame);
      for (const bar of bars) bar.style.transform = "";
    };
  }, [shown, active, still, element, options]);

  if (!shown) return null;
  return (
    <span
      ref={holder}
      className="player-visualizer"
      data-playing={active || undefined}
      data-style={options.visualizerStyle}
      aria-hidden="true"
    >
      {Array.from({ length: options.visualizerBars }, (_, index) => (
        <span key={index} className="visualizer-bar" />
      ))}
    </span>
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
