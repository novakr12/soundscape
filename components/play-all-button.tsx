"use client";

import { type PlayerTrack, usePlayer } from "./player";

export default function PlayAllButton({ tracks }: { tracks: PlayerTrack[] }) {
  const { playAll } = usePlayer();
  if (tracks.length < 2) return null;
  return (
    <button type="button" className="play-all" onClick={() => playAll(tracks)}>
      ▶ Play all
    </button>
  );
}
