"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { audioVolume, stepVolume, VOLUME_STEP } from "@/lib/volume";
import { SpeakerIcon } from "./player-icons";

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

export function VolumeBar({
  value,
  onChange,
  onToggleMute,
  sliderLabel,
  muteLabel,
  unmuteLabel,
  peekKey = 0,
}: {
  value: number;
  onChange: (value: number) => void;
  onToggleMute: () => void;
  sliderLabel: string;
  muteLabel: string;
  unmuteLabel: string;
  peekKey?: number;
}) {
  const [dragging, setDragging] = useState(false);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flash = useCallback(() => {
    setPeek(true);
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(false), 900);
  }, []);

  useEffect(() => () => clearTimeout(peekTimer.current), []);

  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, [dragging]);

  useEffect(() => {
    if (peekKey > 0) flash();
  }, [peekKey, flash]);

  const percent = Math.round(value * 100);
  const muted = value === 0;
  return (
    <div className="volume" data-active={dragging || peek || undefined}>
      <button
        type="button"
        className="icon-button"
        onClick={() => {
          flash();
          onToggleMute();
        }}
        aria-label={muted ? unmuteLabel : muteLabel}
        aria-pressed={muted}
        title={muted ? "Unmute (M)" : "Mute (M)"}
      >
        <SpeakerIcon level={value} />
      </button>
      <span className="volume-slider">
        <input
          type="range"
          min={0}
          max={1}
          step={VOLUME_STEP}
          value={value}
          aria-label={sliderLabel}
          aria-valuetext={`${percent}%`}
          style={{ "--fill": `${percent}%` } as React.CSSProperties}
          onPointerDown={() => setDragging(true)}
          onChange={(event) => {
            flash();
            onChange(Number(event.target.value));
          }}
        />
        <span className="volume-value" aria-hidden="true">
          {percent}%
        </span>
      </span>
    </div>
  );
}

export default function VolumeControl({ audio, level }: { audio: RefObject<HTMLAudioElement | null>; level: number }) {
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [peekKey, setPeekKey] = useState(0);
  const stateRef = useRef({ volume, muted });
  stateRef.current = { volume, muted };

  const toggleMute = useCallback(() => {
    const current = stateRef.current;
    if (current.muted || current.volume === 0) {
      setMuted(false);
      if (current.volume === 0) setVolume(0.5);
    } else {
      setMuted(true);
    }
    setPeekKey((n) => n + 1);
  }, []);

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
    const mute = () => toggleMute();
    const step = (event: Event) => {
      const delta = (event as CustomEvent<unknown>).detail;
      if (typeof delta !== "number" || !Number.isFinite(delta)) return;
      const base = stateRef.current.muted ? 0 : stateRef.current.volume;
      setVolume(stepVolume(base, delta));
      setMuted(false);
      setPeekKey((n) => n + 1);
    };
    window.addEventListener("soundscape-set-volume", change);
    window.addEventListener("soundscape-toggle-mute", mute);
    window.addEventListener("soundscape-step-volume", step);
    return () => {
      window.removeEventListener("soundscape-set-volume", change);
      window.removeEventListener("soundscape-toggle-mute", mute);
      window.removeEventListener("soundscape-step-volume", step);
    };
  }, [toggleMute]);

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
      audio.current.volume = audioVolume(volume, level);
      audio.current.muted = muted;
    }
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ volume, muted }));
    } catch {}
  }, [audio, volume, muted, level, ready]);

  const shown = muted ? 0 : volume;
  return (
    <VolumeBar
      value={shown}
      onChange={(next) => {
        setVolume(next);
        setMuted(false);
      }}
      onToggleMute={toggleMute}
      sliderLabel="Volume"
      muteLabel="Mute"
      unmuteLabel="Unmute"
      peekKey={peekKey}
    />
  );
}
