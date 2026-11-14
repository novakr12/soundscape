"use client";

import { useEffect, useRef } from "react";
import { type PlayerTrack, usePlayer } from "./player";

export default function AutoPlay({ track }: { track: PlayerTrack }) {
  const { play } = usePlayer();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    play(track);
    const address = new URL(window.location.href);
    address.searchParams.delete("play");
    window.history.replaceState(window.history.state, "", address);
  }, [play, track]);

  return null;
}
