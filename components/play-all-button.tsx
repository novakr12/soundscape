"use client";

import { type PlayerTrack, usePlayerActions } from "./player";

export default function PlayAllButton({ tracks }: { tracks: PlayerTrack[] }) {
  const { playAll } = usePlayerActions();
  if (tracks.length < 2) return null;
  return (
    <button type="button" className="play-all" onClick={() => playAll(tracks)}>
      ▶ Play all
    </button>
  );
}
