"use client";

import { type RefObject, useEffect } from "react";
import { SEEK_STEP_SECONDS, type Shortcut, seekTarget, shortcutFor } from "@/lib/play-queue";
import { VOLUME_KEY_STEP } from "@/lib/volume";

const KEEPS_ITS_KEYS =
  "input, textarea, select, button, audio, video, summary, [contenteditable]:not([contenteditable='false']), [role='slider'], [role='textbox'], [role='menuitem']";

function keepsItsKeys(target: EventTarget | null) {
  return target instanceof Element && target.closest(KEEPS_ITS_KEYS) !== null;
}

export type PlayerKeyHandlers = {
  next: () => void;
  previous: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleQueue: () => void;
  toggleLyrics: () => void;
  toggleTheater: () => void;
  toggleMute: () => void;
  stepVolume: (delta: number) => void;
  openHelp: () => void;
};

export function usePlayerKeys(
  audioRef: RefObject<HTMLAudioElement | null>,
  tracksRef: RefObject<unknown[]>,
  handlers: RefObject<PlayerKeyHandlers>,
  remote: RefObject<(shortcut: Shortcut) => boolean>,
) {
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      if (event.defaultPrevented || keepsItsKeys(event.target) || document.querySelector("dialog[open]") !== null) {
        return;
      }
      const wanted = shortcutFor(event.key, {
        shift: event.shiftKey,
        other: event.ctrlKey || event.metaKey || event.altKey,
        repeat: event.repeat,
      });
      if (!wanted) return;
      if (wanted === "help") {
        event.preventDefault();
        handlers.current.openHelp();
        return;
      }
      if (remote.current(wanted)) {
        event.preventDefault();
        return;
      }
      const audio = audioRef.current;
      if (!audio?.currentSrc || tracksRef.current.length === 0) return;
      event.preventDefault();
      if (wanted === "toggle") {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      } else if (wanted === "back" || wanted === "forward") {
        const step = wanted === "back" ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS;
        audio.currentTime = seekTarget(audio.currentTime, step, audio.duration);
      } else if (wanted === "next") {
        handlers.current.next();
      } else if (wanted === "previous") {
        handlers.current.previous();
      } else if (wanted === "mute") {
        handlers.current.toggleMute();
      } else if (wanted === "volume-up" || wanted === "volume-down") {
        handlers.current.stepVolume(wanted === "volume-up" ? VOLUME_KEY_STEP : -VOLUME_KEY_STEP);
      } else if (wanted === "shuffle") {
        handlers.current.toggleShuffle();
      } else if (wanted === "repeat") {
        handlers.current.cycleRepeat();
      } else if (wanted === "queue") {
        handlers.current.toggleQueue();
      } else if (wanted === "lyrics") {
        handlers.current.toggleLyrics();
      } else if (wanted === "theater") {
        handlers.current.toggleTheater();
      }
    };
    window.addEventListener("keydown", pressed);
    return () => window.removeEventListener("keydown", pressed);
  }, [audioRef, tracksRef, handlers, remote]);
}
