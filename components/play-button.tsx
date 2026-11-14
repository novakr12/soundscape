"use client";

import { useRef } from "react";
import { type PlayerTrack, usePlayer } from "./player";

export default function PlayButton({ track }: { track: PlayerTrack }) {
  const { current, play, playNext, addToQueue } = usePlayer();
  const menu = useRef<HTMLDetailsElement>(null);
  const isCurrent = current?.trackId === track.trackId;

  function choose(action: (track: PlayerTrack) => void) {
    action(track);
    if (menu.current) menu.current.open = false;
  }

  return (
    <span className="play-controls">
      <button type="button" onClick={() => play(track)} aria-pressed={isCurrent}>
        {isCurrent ? "♪ Playing" : "▶ Play"}
      </button>
      <details className="queue-menu" ref={menu}>
        <summary aria-label={`More for ${track.title}`} title="Play next or add to queue">
          ⋯
        </summary>
        <div className="queue-menu-items">
          <button type="button" onClick={() => choose(playNext)}>
            Play next
          </button>
          <button type="button" onClick={() => choose(addToQueue)}>
            Add to queue
          </button>
        </div>
      </details>
    </span>
  );
}
