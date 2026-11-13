"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TooltipBoxProps = {
  active?: boolean;
  label?: string | number;
  payload?: readonly { value?: unknown }[];
  formatLabel?: (label: string) => string;
};

function TooltipBox({ active, label, payload, formatLabel }: TooltipBoxProps) {
  if (!active || !payload?.length) return null;
  const plays = Number(payload[0].value);
  const text = formatLabel ? formatLabel(String(label)) : String(label);
  return (
    <div className="chart-tooltip">
      <span>{text}</span>
      <strong>
        {plays} {plays === 1 ? "play" : "plays"}
      </strong>
    </div>
  );
}

const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const axisTick = { fill: "var(--chart-axis)", fontSize: 12 };

export function DailyPlaysChart({ data }: { data: { day: string; plays: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="day"
          tickFormatter={shortDate}
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: "var(--chart-baseline)" }}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "var(--chart-hover)" }}
          content={(props) => <TooltipBox {...props} formatLabel={shortDate} />}
        />
        <Bar dataKey="plays" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const shortMonth = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1];

const longMonth = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function MonthlyPlaysChart({ data }: { data: { month: string; plays: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="month"
          tickFormatter={shortMonth}
          tick={{ ...axisTick, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--chart-baseline)" }}
          interval="preserveStartEnd"
          minTickGap={2}
        />
        <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "var(--chart-hover)" }}
          content={(props) => <TooltipBox {...props} formatLabel={longMonth} />}
        />
        <Bar dataKey="plays" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RankedBarChart({ data }: { data: { name: string; plays: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 32 + 16)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fill: "var(--fg)", fontSize: 13 }}
          tickLine={false}
          axisLine={{ stroke: "var(--chart-baseline)" }}
        />
        <Tooltip cursor={{ fill: "var(--chart-hover)" }} content={(props) => <TooltipBox {...props} />} />
        <Bar dataKey="plays" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={20}>
          <LabelList dataKey="plays" position="right" fill="var(--muted)" fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const percent = (share: number) => `${Math.round(share * 1000) / 10}%`;

type ClockTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: readonly { dataKey?: unknown; value?: unknown }[];
};

function ClockTooltip({ active, label, payload }: ClockTooltipProps) {
  if (!active || !payload?.length) return null;
  const hour = Number(label);
  const value = (key: string) => payload.find((item) => item.dataKey === key)?.value;
  const following = value("following");
  return (
    <div className="chart-tooltip">
      <span>
        {hourLabel(hour)}–{hourLabel((hour + 1) % 24)}
      </span>
      <strong>You {percent(Number(value("you")))}</strong>
      {following !== undefined && <span>People you follow {percent(Number(following))}</span>}
    </div>
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
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="hour"
            tickFormatter={(hour) => String(hour).padStart(2, "0")}
            ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-baseline)" }}
          />
          <YAxis
            tickFormatter={(share) => `${Math.round(share * 100)}%`}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={{ fill: "var(--chart-hover)" }} content={(props) => <ClockTooltip {...props} />} />
          <Bar dataKey="you" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
          {comparing && (
            <Line
              dataKey="following"
              type="linear"
              stroke="var(--chart-axis)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--chart-axis)", stroke: "var(--bg)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}
