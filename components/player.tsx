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
  play: (track: PlayerTrack) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const player = useContext(PlayerContext);
  if (!player) throw new Error("usePlayer must be used inside PlayerProvider");
  return player;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<PlayerTrack | null>(null);
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
    audio.addEventListener("play", playing);
    audio.addEventListener("pause", paused);
    audio.addEventListener("ended", paused);
    return () => {
      audio.removeEventListener("play", playing);
      audio.removeEventListener("pause", paused);
      audio.removeEventListener("ended", paused);
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

  function play(track: PlayerTrack) {
    const audio = audioRef.current;
    if (!audio) return;
    const id = ++playing.current;
    fellBack.current = false;
    setCurrent(track);
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
    setError("Preview unavailable for this track");
  }

  return (
    <PlayerContext.Provider value={{ current, play }}>
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
              </span>
            </>
          )}
          {error && <span className="error">{error}</span>}
        </div>
        <audio ref={audioRef} controls onError={failed} />
        <VolumeControl audio={audioRef} />
      </div>
    </PlayerContext.Provider>
  );
}
