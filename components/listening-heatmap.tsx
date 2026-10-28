"use client";

import { Fragment, useState } from "react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const LEVELS = [0, 1, 2, 3, 4, 5];

const clock = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;

function level(count: number, max: number) {
  return count === 0 ? 0 : Math.max(1, Math.ceil((count / max) * 5));
}

export default function ListeningHeatmap({ grid, summary }: { grid: number[][]; summary: string }) {
  const [active, setActive] = useState<{ day: number; hour: number } | null>(null);
  const max = Math.max(...grid.flat());
  const count = active ? grid[active.day][active.hour] : 0;
  const caption = active
    ? `${DAYS[active.day]} ${clock(active.hour)}–${clock(active.hour + 1)} · ${count} play${count === 1 ? "" : "s"}`
    : "Point at a square to see its plays.";

  return (
    <div className="heatmap" onMouseLeave={() => setActive(null)}>
      <div className="heatmap-grid" role="img" aria-label={summary}>
        <span />
        {grid[0].map((_, hour) => (
          <span key={hour} className="heatmap-hour">
            {hour % 3 === 0 ? hour : ""}
          </span>
        ))}
        {grid.map((row, day) => (
          <Fragment key={day}>
            <span className="heatmap-day">{DAYS[day].slice(0, 3)}</span>
            {row.map((plays, hour) => (
              <span
                key={hour}
                className={`heatmap-cell level-${level(plays, max)}`}
                data-active={active?.day === day && active.hour === hour}
                onMouseEnter={() => setActive({ day, hour })}
                onClick={() => setActive({ day, hour })}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <div className="heatmap-footer">
        <span className="muted">{caption}</span>
        <span className="heatmap-key muted" aria-hidden="true">
          Less
          {LEVELS.map((l) => (
            <span key={l} className={`heatmap-cell level-${l}`} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
