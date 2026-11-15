"use client";

import { useEffect, useRef, useState } from "react";
import { MoonIcon } from "./player-icons";

export type Sleep = { kind: "song" } | { kind: "time"; until: number } | null;

const MINUTES = [15, 30, 45, 60];

export function minutesLeft(sleep: Sleep, now: number) {
  return sleep?.kind === "time" ? Math.max(1, Math.ceil((sleep.until - now) / 60_000)) : null;
}

function describe(sleep: Sleep, now: number) {
  if (!sleep) return "Sleep timer";
  if (sleep.kind === "song") return "Stops after this song";
  const left = minutesLeft(sleep, now);
  return left === 1 ? "Stops in 1 minute" : `Stops in ${left} minutes`;
}

export default function SleepTimer({ sleep, onChoose }: { sleep: Sleep; onChoose: (sleep: Sleep) => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (sleep?.kind !== "time") return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [sleep]);

  function choose(next: Sleep) {
    onChoose(next);
    if (menu.current) menu.current.open = false;
  }

  const label = describe(sleep, now);
  const left = minutesLeft(sleep, now);
  return (
    <details className="queue-menu sleep-menu" ref={menu}>
      <summary
        className={sleep ? "icon-button player-toggle active" : "icon-button player-toggle"}
        data-player="sleep"
        aria-label={label}
        title={label}
      >
        <MoonIcon size={17} />
        {left !== null && <span className="sleep-left">{left}</span>}
      </summary>
      <div className="queue-menu-items">
        <button type="button" onClick={() => choose({ kind: "song" })} aria-pressed={sleep?.kind === "song"}>
          Stop after this song
        </button>
        {MINUTES.map((minutes) => (
          <button
            type="button"
            key={minutes}
            onClick={() => choose({ kind: "time", until: Date.now() + minutes * 60_000 })}
          >
            {minutes === 60 ? "In 1 hour" : `In ${minutes} minutes`}
          </button>
        ))}
        {sleep && (
          <button type="button" onClick={() => choose(null)}>
            Turn off
          </button>
        )}
      </div>
    </details>
  );
}
