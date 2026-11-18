"use client";

import { useEffect, useState } from "react";
import { useNow } from "./use-now";

type Props = {
  startedAt: number;
  durationMs?: number;
  pausedAt?: number;
  serverNow: number;
};

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function SongProgress({ startedAt, durationMs, pausedAt, serverNow }: Props) {
  const [clockOffset] = useState(() => Date.now() - serverNow);
  const ticked = useNow(1000, !pausedAt);
  const [started, setStarted] = useState(false);
  useEffect(() => setStarted(true), []);
  const now = started ? ticked - clockOffset : serverNow;

  const elapsed = Math.max(0, (pausedAt ?? now) - startedAt);
  const equalizer = (
    <span className={pausedAt ? "equalizer paused" : "equalizer"} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
  if (!durationMs) {
    return (
      <small className="muted progress">
        {equalizer}
        <span>{pausedAt ? `paused at ${clock(elapsed)}` : `playing for ${clock(elapsed)}`}</span>
      </small>
    );
  }

  const shown = Math.min(elapsed, durationMs);
  return (
    <small className="muted progress">
      {equalizer}
      <span>
        {clock(shown)} / {clock(durationMs)}
        {pausedAt && " · paused"}
      </span>
      <span className="progress-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${shown / durationMs})` }} />
      </span>
    </small>
  );
}
