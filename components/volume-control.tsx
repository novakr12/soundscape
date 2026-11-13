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

export default function VolumeControl({ audio }: { audio: RefObject<HTMLAudioElement | null> }) {
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
    const element = audio.current;
    if (!element || !ready) return;
    const follow = () => {
      setVolume(element.volume);
      setMuted(element.muted);
    };
    element.addEventListener("volumechange", follow);
    return () => element.removeEventListener("volumechange", follow);
  }, [audio, ready]);

  useEffect(() => {
    if (!ready) return;
    if (audio.current) {
      audio.current.volume = volume;
      audio.current.muted = muted;
    }
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ volume, muted }));
    } catch {}
  }, [audio, volume, muted, ready]);

  const level = muted ? 0 : volume;
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
        aria-label={level === 0 ? "Unmute" : "Mute"}
        aria-pressed={level === 0}
      >
        <Speaker level={level} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={level}
        aria-label="Volume"
        style={{ "--fill": `${Math.round(level * 100)}%` } as React.CSSProperties}
        onChange={(event) => {
          setVolume(Number(event.target.value));
          setMuted(false);
        }}
      />
    </div>
  );
}
