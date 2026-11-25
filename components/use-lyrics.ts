"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { currentLine, type Lyrics } from "@/lib/lyrics-text";
import type { PlayerTrack } from "./player";

const REFRESH_MS = 250;
const PLAY_EVENTS = ["play", "playing", "pause", "ended", "emptied"];
const MAX_LYRICS_CACHE = 50;
const lyricsCache = new Map<string, Lyrics | null>();

type State = { key: string; lyrics: Lyrics | null } | { key: string; loading: true } | { key: string; failed: true };

function keyOf(track: PlayerTrack) {
  return `${track.trackId}|${track.songId ?? ""}`;
}

function rememberLyrics(key: string, lyrics: Lyrics | null) {
  if (lyricsCache.has(key)) lyricsCache.delete(key);
  else if (lyricsCache.size >= MAX_LYRICS_CACHE) {
    const oldest = lyricsCache.keys().next().value;
    if (oldest !== undefined) lyricsCache.delete(oldest);
  }
  lyricsCache.set(key, lyrics);
}

export function useLyrics({
  track,
  time,
  playing,
  audio,
  enabled = true,
}: {
  track: PlayerTrack;
  time: () => number;
  playing?: boolean;
  audio?: RefObject<HTMLAudioElement | null>;
  enabled?: boolean;
}) {
  const clock = useRef(time);
  clock.current = time;
  const key = keyOf(track);
  const [state, setState] = useState<State>(() =>
    lyricsCache.has(key) ? { key, lyrics: lyricsCache.get(key) ?? null } : { key, loading: true },
  );
  const [activeLine, setActiveLine] = useState(-1);

  useEffect(() => {
    if (!enabled) {
      setActiveLine(-1);
      return;
    }
    if (lyricsCache.has(key)) {
      const next = lyricsCache.get(key) ?? null;
      setState((current) =>
        "lyrics" in current && current.key === key && current.lyrics === next ? current : { key, lyrics: next },
      );
      return;
    }
    const params = new URLSearchParams({ trackId: track.trackId, title: track.title, artist: track.artist });
    if (track.songId) params.set("songId", track.songId);
    if (track.album) params.set("album", track.album);
    const stop = new AbortController();
    setState({ key, loading: true });
    setActiveLine(-1);
    fetch(`/api/lyrics?${params}`, { signal: stop.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((answer: { lyrics: Lyrics | null }) => {
        rememberLyrics(key, answer.lyrics);
        if (!stop.signal.aborted) setState({ key, lyrics: answer.lyrics });
      })
      .catch(() => {
        if (!stop.signal.aborted) setState({ key, failed: true });
      });
    return () => {
      stop.abort();
    };
  }, [enabled, key, track.trackId, track.songId, track.title, track.artist, track.album]);

  const lyrics = "lyrics" in state && state.key === key ? state.lyrics : null;

  useEffect(() => {
    if (!enabled || !lyrics?.synced) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const isPlaying = () => {
      if (playing !== undefined) return playing;
      const element = audio?.current;
      return element ? !element.paused && !element.ended : true;
    };
    const tick = () => setActiveLine(currentLine(lyrics.lines, clock.current()));
    const arm = () => {
      const wanted = !document.hidden && isPlaying();
      if (wanted && timer === undefined) {
        tick();
        timer = setInterval(tick, REFRESH_MS);
      } else if (!wanted && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    tick();
    arm();
    document.addEventListener("visibilitychange", arm);
    if (audio) {
      for (const event of PLAY_EVENTS) document.addEventListener(event, arm, true);
    }
    return () => {
      if (timer !== undefined) clearInterval(timer);
      document.removeEventListener("visibilitychange", arm);
      if (audio) {
        for (const event of PLAY_EVENTS) document.removeEventListener(event, arm, true);
      }
    };
  }, [enabled, lyrics, playing, audio]);

  return {
    loading: enabled && ("loading" in state || state.key !== key),
    failed: enabled && "failed" in state && state.key === key,
    lyrics,
    activeLine,
  };
}
