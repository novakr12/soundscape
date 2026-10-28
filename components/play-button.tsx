"use client";

import { type PlayerTrack, usePlayer } from "./player";

export default function PlayButton({ track }: { track: PlayerTrack }) {
  const { current, play } = usePlayer();
  const isCurrent = current?.trackId === track.trackId;

  return (
    <button type="button" onClick={() => play(track)} aria-pressed={isCurrent}>
      {isCurrent ? "♪ Playing" : "▶ Preview"}
    </button>
  );
}
