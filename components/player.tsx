"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ArtistLink, SongLink } from "./music-links";
import VolumeControl from "./volume-control";

export type PlayerTrack = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
};

type PlayerContextValue = {
  current: PlayerTrack | null;
  queue: PlayerTrack[];
  position: number;
  play: (track: PlayerTrack) => void;
  playAll: (tracks: PlayerTrack[], start?: number) => void;
  next: () => void;
  previous: () => void;
};

const RESTART_AFTER_SECONDS = 3;
const SKIP_BROKEN_AFTER_MS = 1500;

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const player = useContext(PlayerContext);
  if (!player) throw new Error("usePlayer must be used inside PlayerProvider");
  return player;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [position, setPosition] = useState(0);
  const current = queue[position] ?? null;
  const queueRef = useRef<PlayerTrack[]>([]);
  const positionRef = useRef(0);
  const skip = useRef({ next: () => {}, previous: () => {} });
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const playing = useRef(0);
  const fellBack = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => audio.play().catch(() => {})],
      ["pause", () => audio.pause()],
      [
        "stop",
        () => {
          audio.pause();
          audio.currentTime = 0;
        },
      ],
      [
        "seekto",
        (details) => {
          if (details.seekTime !== undefined) audio.currentTime = details.seekTime;
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
    const playing = () => {
      session.playbackState = "playing";
    };
    const paused = () => {
      session.playbackState = "paused";
    };
    const ended = () => {
      paused();
      skip.current.next();
    };
    audio.addEventListener("play", playing);
    audio.addEventListener("pause", paused);
    audio.addEventListener("ended", ended);
    return () => {
      audio.removeEventListener("play", playing);
      audio.removeEventListener("pause", paused);
      audio.removeEventListener("ended", ended);
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {}
      }
    };
  }, []);

  function describe(track: PlayerTrack, isFull: boolean) {
    setFull(isFull);
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: isFull ? "Full song from Navidrome" : "30-second preview",
      artwork: track.cover ? [{ src: track.cover }] : [],
    });
  }

  function moveTo(tracks: PlayerTrack[], index: number) {
    queueRef.current = tracks;
    positionRef.current = index;
    setQueue(tracks);
    setPosition(index);
    start(tracks[index]);
  }

  function play(track: PlayerTrack) {
    moveTo([track], 0);
  }

  function playAll(tracks: PlayerTrack[], first = 0) {
    if (tracks.length === 0) return;
    moveTo(tracks, Math.min(Math.max(first, 0), tracks.length - 1));
  }

  function next() {
    const index = positionRef.current + 1;
    if (index < queueRef.current.length) moveTo(queueRef.current, index);
  }

  function previous() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime > RESTART_AFTER_SECONDS || positionRef.current === 0) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    moveTo(queueRef.current, positionRef.current - 1);
  }

  skip.current = { next, previous };
  const hasNext = position + 1 < queue.length;

  function start(track: PlayerTrack) {
    const audio = audioRef.current;
    if (!audio) return;
    const id = ++playing.current;
    fellBack.current = false;
    setError(null);
    describe(track, false);
    const path = `/api/listen/${encodeURIComponent(track.trackId)}`;
    audio.src = path;
    audio.play().catch(() => {});
    fetch(`${path}?info`)
      .then((response) => (response.ok ? response.json() : { full: false }))
      .then((info: { full?: boolean }) => {
        if (id === playing.current && !fellBack.current) describe(track, info.full === true);
      })
      .catch(() => {});
  }

  function failed() {
    const audio = audioRef.current;
    if (!current || !audio) return;
    if (!fellBack.current) {
      fellBack.current = true;
      describe(current, false);
      audio.src = `/api/preview/${encodeURIComponent(current.trackId)}`;
      audio.play().catch(() => {});
      return;
    }
    setError("Can't play this song right now");
    const id = playing.current;
    setTimeout(() => {
      if (id === playing.current) next();
    }, SKIP_BROKEN_AFTER_MS);
  }

  return (
    <PlayerContext.Provider value={{ current, queue, position, play, playAll, next, previous }}>
      {children}
      <div className="player" hidden={!current}>
        {current?.cover && <img src={current.cover} alt="" width={48} height={48} />}
        <div className="now-playing">
          {current && (
            <>
              <strong>
                <SongLink trackId={current.trackId}>{current.title}</SongLink>
              </strong>
              <span className="muted">
                <ArtistLink name={current.artist} /> · {full ? "full song from Navidrome" : "30-second preview"}
                {queue.length > 1 && ` · ${position + 1} of ${queue.length}`}
              </span>
            </>
          )}
          {error && <span className="error">{error}</span>}
        </div>
        <div className="player-skip">
          <button type="button" data-player="previous" aria-label="Previous song" onClick={previous}>
            ⏮
          </button>
          <button type="button" data-player="next" aria-label="Next song" onClick={next} disabled={!hasNext}>
            ⏭
          </button>
        </div>
        <audio ref={audioRef} controls onError={failed} />
        <VolumeControl audio={audioRef} />
      </div>
    </PlayerContext.Provider>
  );
}
