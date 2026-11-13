"use client";

import { createContext, useContext, useRef, useState } from "react";
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

  function play(track: PlayerTrack) {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrent(track);
    setError(null);
    audio.src = `/api/preview/${encodeURIComponent(track.trackId)}`;
    audio.play().catch(() => {});
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
                <ArtistLink name={current.artist} /> · 30-second preview
              </span>
            </>
          )}
          {error && <span className="error">{error}</span>}
        </div>
        <audio ref={audioRef} controls onError={() => current && setError("Preview unavailable for this track")} />
        <VolumeControl audio={audioRef} />
      </div>
    </PlayerContext.Provider>
  );
}
