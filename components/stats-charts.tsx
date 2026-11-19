import type { ReactNode } from "react";
import { niceTicks, share, shownLabels } from "@/lib/chart-scale";
import ChartHover from "./chart-hover";
import TrendLine from "./trend-line";

function Plays({ label, plays }: { label: string; plays: number }) {
  return (
    <>
      <span>{label}</span>
      <strong>
        {plays} {plays === 1 ? "play" : "plays"}
      </strong>
    </>
  );
}

const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const shortMonth = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1];

const longMonth = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function Bars({
  values,
  labels,
  tips,
  widest,
  format = String,
  integers = true,
  line,
}: {
  values: number[];
  labels: (string | null)[];
  tips: ReactNode[];
  widest: number;
  format?: (value: number) => string;
  integers?: boolean;
  line?: number[];
}) {
  const ticks = niceTicks(Math.max(0, ...values, ...(line ?? [])), 4, integers);
  const top = ticks[ticks.length - 1];
  return (
    <ChartHover count={values.length} tips={tips}>
      <div className="bars">
        <div className="bars-y" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${share(tick, top)}%` }}>
              {format(tick)}
            </span>
          ))}
        </div>
        <div className="bars-plot chart-plot">
          {ticks.map((tick) => (
            <span key={tick} className="bars-grid" style={{ bottom: `${share(tick, top)}%` }} />
          ))}
          {values.map((value, index) => (
            <span key={labels[index] ?? index} className="bars-slot">
              <span className="bars-bar" style={{ height: `${share(value, top)}%`, maxWidth: widest }} />
            </span>
          ))}
          {line && <TrendLine shares={line.map((value) => share(value, top))} />}
        </div>
        <span />
        <div className="bars-x" aria-hidden="true">
          {labels.map((label, index) =>
            label === null ? null : (
              <span key={label} style={{ left: `${((index + 0.5) / labels.length) * 100}%` }}>
                {label}
              </span>
            ),
          )}
        </div>
      </div>
    </ChartHover>
  );
}

export function DailyPlaysChart({ data }: { data: { day: string; plays: number }[] }) {
  const shown = shownLabels(data.length);
  return (
    <Bars
      values={data.map((day) => day.plays)}
      labels={data.map((day, index) => (shown[index] ? shortDate(day.day) : null))}
      tips={data.map((day) => <Plays key={day.day} label={shortDate(day.day)} plays={day.plays} />)}
      widest={24}
    />
  );
}

export function MonthlyPlaysChart({ data }: { data: { month: string; plays: number }[] }) {
  return (
    <Bars
      values={data.map((month) => month.plays)}
      labels={data.map((month) => shortMonth(month.month))}
      tips={data.map((month) => <Plays key={month.month} label={longMonth(month.month)} plays={month.plays} />)}
      widest={32}
    />
  );
}

export function RankedBarChart({ data }: { data: { name: string; plays: number }[] }) {
  const most = Math.max(1, ...data.map((row) => row.plays));
  return (
    <ChartHover
      count={data.length}
      vertical
      tips={data.map((row) => <Plays key={row.name} label={row.name} plays={row.plays} />)}
    >
      <div className="ranked chart-plot">
        {data.map((row) => (
          <div key={row.name} className="ranked-row">
            <span className="ranked-name">{row.name}</span>
            <span className="ranked-track">
              <span className="ranked-bar" style={{ width: `calc((100% - 3.5rem) * ${row.plays / most})` }} />
              <span className="ranked-value">{row.plays}</span>
            </span>
          </div>
        ))}
      </div>
    </ChartHover>
  );
}

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const percent = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;
const tickPercent = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;
const CLOCK_TICKS = new Set([0, 3, 6, 9, 12, 15, 18, 21]);

function ClockTooltip({ hour, you, following }: { hour: number; you: number; following?: number }) {
  return (
    <>
      <span>
        {hourLabel(hour)}–{hourLabel((hour + 1) % 24)}
      </span>
      <strong>You {percent(you)}</strong>
      {following !== undefined && <span>People you follow {percent(following)}</span>}
    </>
  );
}

export function ListeningClockChart({ data }: { data: { hour: number; you: number; following?: number }[] }) {
  const comparing = data.some((hour) => hour.following !== undefined);
  return (
    <>
      <ul className="chart-legend">
        <li>
          <span className="legend-bar" /> You
        </li>
        {comparing && (
          <li>
            <span className="legend-line" /> People you follow, on average
          </li>
        )}
      </ul>
      <Bars
        values={data.map((hour) => hour.you)}
        labels={data.map((hour) => (CLOCK_TICKS.has(hour.hour) ? String(hour.hour).padStart(2, "0") : null))}
        tips={data.map((hour) => <ClockTooltip key={hour.hour} {...hour} />)}
        widest={20}
        format={tickPercent}
        integers={false}
        line={comparing ? data.map((hour) => hour.following ?? 0) : undefined}
      />
    </>
  );
}
