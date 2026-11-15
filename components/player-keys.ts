"use client";

import { type RefObject, useEffect } from "react";
import { SEEK_STEP_SECONDS, seekTarget, shortcutFor } from "@/lib/play-queue";

const KEEPS_ITS_KEYS =
  "input, textarea, select, button, audio, video, summary, [contenteditable]:not([contenteditable='false']), [role='slider'], [role='textbox'], [role='menuitem']";

function keepsItsKeys(target: EventTarget | null) {
  return target instanceof Element && target.closest(KEEPS_ITS_KEYS) !== null;
}

export function usePlayerKeys(
  audioRef: RefObject<HTMLAudioElement | null>,
  tracksRef: RefObject<unknown[]>,
  skip: RefObject<{ next: () => void; previous: () => void }>,
) {
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      if (event.defaultPrevented || keepsItsKeys(event.target)) return;
      const audio = audioRef.current;
      if (!audio?.currentSrc || tracksRef.current.length === 0) return;
      const shortcut = shortcutFor(event.key, {
        shift: event.shiftKey,
        other: event.ctrlKey || event.metaKey || event.altKey,
        repeat: event.repeat,
      });
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "toggle") {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      } else if (shortcut === "back" || shortcut === "forward") {
        const step = shortcut === "back" ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS;
        audio.currentTime = seekTarget(audio.currentTime, step, audio.duration);
      } else if (shortcut === "next") {
        skip.current.next();
      } else {
        skip.current.previous();
      }
    };
    window.addEventListener("keydown", pressed);
    return () => window.removeEventListener("keydown", pressed);
  }, [audioRef, tracksRef, skip]);
}
