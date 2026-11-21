"use client";

import { type RefObject, useEffect, useRef } from "react";
import { LOCK_SCREEN_SKIP_SECONDS, lockScreenPosition, seekTarget, songLength } from "@/lib/play-queue";

type TrackLike = { duration?: number };

export function useMediaSession(
  audioRef: RefObject<HTMLAudioElement | null>,
  active: HTMLAudioElement | null,
  currentTrack: () => TrackLike | null,
  skip: RefObject<{ prepare: () => void; next: () => void; previous: () => void }>,
) {
  const currentRef = useRef(currentTrack);
  currentRef.current = currentTrack;

  useEffect(() => {
    skip.current.prepare();
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => audioRef.current?.play().catch(() => {})],
      ["pause", () => audioRef.current?.pause()],
      [
        "stop",
        () => {
          const audio = audioRef.current;
          if (!audio) return;
          audio.pause();
          audio.currentTime = 0;
        },
      ],
      [
        "seekto",
        (details) => {
          const audio = audioRef.current;
          if (audio && details.seekTime !== undefined) audio.currentTime = details.seekTime;
        },
      ],
      [
        "seekbackward",
        (details) => {
          const audio = audioRef.current;
          if (!audio) return;
          audio.currentTime = seekTarget(
            audio.currentTime,
            -(details.seekOffset ?? LOCK_SCREEN_SKIP_SECONDS),
            songLength(audio.duration, currentRef.current()?.duration),
          );
        },
      ],
      [
        "seekforward",
        (details) => {
          const audio = audioRef.current;
          if (!audio) return;
          audio.currentTime = seekTarget(
            audio.currentTime,
            details.seekOffset ?? LOCK_SCREEN_SKIP_SECONDS,
            songLength(audio.duration, currentRef.current()?.duration),
          );
        },
      ],
      ["nexttrack", () => skip.current.next()],
      ["previoustrack", () => skip.current.previous()],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {}
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {}
      }
    };
  }, [audioRef, skip]);

  useEffect(() => {
    const audio = active;
    if (!audio || !("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    let last = 0;
    const tell = (event?: Event) => {
      const now = performance.now();
      if (event?.type === "timeupdate" && now - last < 1000) return;
      last = now;
      const state = lockScreenPosition(
        songLength(audio.duration, currentRef.current()?.duration),
        audio.currentTime,
        audio.playbackRate,
      );
      try {
        navigator.mediaSession.setPositionState(state ?? undefined);
      } catch {}
    };
    const events = ["timeupdate", "durationchange", "loadedmetadata", "seeked", "ratechange", "play", "pause"];
    for (const name of events) audio.addEventListener(name, tell);
    tell();
    return () => {
      for (const name of events) audio.removeEventListener(name, tell);
    };
  }, [active]);
}
