"use client";

import { useEffect, useRef } from "react";
import type { MusicSong } from "@/lib/music";
import PlayButton from "./play-button";
import { usePlayer } from "./player";
import { PlayIcon, ShuffleIcon } from "./player-icons";

function length(seconds: number | undefined) {
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export default function MusicList({
  songs,
  firstNumber = 1,
  autoplay = false,
}: {
  songs: MusicSong[];
  firstNumber?: number;
  autoplay?: boolean;
}) {
  const { playFrom, shuffle, toggleShuffle } = usePlayer();
  const started = useRef(false);
  const latest = useRef({ playFrom, shuffle, songs });
  latest.current = { playFrom, shuffle, songs };

  useEffect(() => {
    if (!autoplay || started.current) return;
    started.current = true;
    const address = new URL(window.location.href);
    address.searchParams.delete("play");
    window.history.replaceState(window.history.state, "", address);
    const timer = setTimeout(() => {
      const { playFrom, shuffle, songs } = latest.current;
      if (songs.length > 0) playFrom(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0);
    }, 0);
    return () => {
      clearTimeout(timer);
      started.current = false;
    };
  }, [autoplay]);

  if (songs.length === 0) return <p className="muted">No songs here.</p>;
  return (
    <>
      <div className="music-actions">
        <button
          type="button"
          className="music-play"
          onClick={() => playFrom(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0)}
        >
          <PlayIcon size={18} /> Play
        </button>
        <button
          type="button"
          className="icon-button player-toggle"
          aria-label="Shuffle"
          aria-pressed={shuffle}
          title={shuffle ? "Shuffle is on" : "Shuffle is off"}
          onClick={toggleShuffle}
        >
          <ShuffleIcon size={18} />
        </button>
      </div>
      <ol className="music-songs" start={firstNumber}>
        {songs.map((song, i) => (
          <li key={`${song.songId ?? song.trackId}-${i}`}>
            <span className="music-number">{firstNumber + i}</span>
            {song.cover ? (
              <img src={song.cover} alt="" width={40} height={40} loading="lazy" />
            ) : (
              <span className="music-cover-empty" aria-hidden="true" />
            )}
            <span className="music-song">
              <strong>{song.title}</strong>
              <span className="muted">
                {song.artist}
                {song.album ? ` · ${song.album}` : ""}
              </span>
            </span>
            <span className="music-length muted">{length(song.duration)}</span>
            <PlayButton track={song} onPlay={() => playFrom(songs, i)} />
          </li>
        ))}
      </ol>
    </>
  );
}
