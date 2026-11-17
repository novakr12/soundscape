"use client";

import { type RefObject, useEffect, useState } from "react";

const KEY = "soundscape-volume";

function saved(): { volume: number; muted: boolean } {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (value && typeof value.volume === "number" && value.volume >= 0 && value.volume <= 1) {
      return { volume: value.volume, muted: Boolean(value.muted) };
    }
  } catch {}
  return { volume: 0.8, muted: false };
}

function Speaker({ level }: { level: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" strokeLinejoin="round" />
      {level === 0 ? (
        <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />
      ) : (
        <>
          <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" strokeLinecap="round" />
          {level > 0.5 && <path d="M19 7a7 7 0 0 1 0 10" strokeLinecap="round" />}
        </>
      )}
    </svg>
  );
}

export default function VolumeControl({ audio, level }: { audio: RefObject<HTMLAudioElement | null>; level: number }) {
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const value = saved();
    setVolume(value.volume);
    setMuted(value.muted);
    setReady(true);
  }, []);

  useEffect(() => {
    const change = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      if (typeof value !== "number" || value < 0 || value > 1) return;
      setVolume(value);
      setMuted(false);
    };
    window.addEventListener("soundscape-set-volume", change);
    return () => window.removeEventListener("soundscape-set-volume", change);
  }, []);

  useEffect(() => {
    const element = audio.current;
    if (!element || !ready) return;
    const follow = () => setMuted(element.muted);
    element.addEventListener("volumechange", follow);
    return () => element.removeEventListener("volumechange", follow);
  }, [audio, ready]);

  useEffect(() => {
    if (!ready) return;
    if (audio.current) {
      audio.current.volume = volume * level;
      audio.current.muted = muted;
    }
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ volume, muted }));
    } catch {}
  }, [audio, volume, muted, level, ready]);

  const shown = muted ? 0 : volume;
  return (
    <div className="volume">
      <button
        type="button"
        className="icon-button"
        onClick={() => {
          if (muted || volume === 0) {
            setMuted(false);
            if (volume === 0) setVolume(0.5);
          } else {
            setMuted(true);
          }
        }}
        aria-label={shown === 0 ? "Unmute" : "Mute"}
        aria-pressed={shown === 0}
      >
        <Speaker level={shown} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={shown}
        aria-label="Volume"
        style={{ "--fill": `${Math.round(shown * 100)}%` } as React.CSSProperties}
        onChange={(event) => {
          setVolume(Number(event.target.value));
          setMuted(false);
        }}
      />
    </div>
  );
}
