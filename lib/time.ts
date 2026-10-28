export const TIME_ZONE = "Europe/Belgrade";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const offsetFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" });

const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const clockWithZoneFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

export function monthBucket(date: Date) {
  return localDay(date).slice(0, 7);
}

export function monthRange(month: string) {
  const [year, number] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
  return { from: startOfDay(`${month}-01`), to: startOfDay(next) };
}

export function localDay(date: Date) {
  return dayFormat.format(date);
}

export function addDays(day: string, days: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

function weekday(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

function offsetMs(date: Date) {
  const name = offsetFormat.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "";
  const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
}

export function startOfDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, date);
  return new Date(utcMidnight - offsetMs(new Date(utcMidnight)));
}

export function nextMidnight(now: Date) {
  return startOfDay(addDays(localDay(now), 1));
}

export function nextMonday(now: Date) {
  const today = localDay(now);
  return startOfDay(addDays(today, (8 - weekday(today)) % 7 || 7));
}

export function daysThisWeek(now = new Date()) {
  const today = localDay(now);
  const daysSinceMonday = (weekday(today) + 6) % 7;
  return Array.from({ length: daysSinceMonday + 1 }, (_, i) => addDays(today, i - daysSinceMonday));
}

export function formatClock(date: Date) {
  return clockFormat.format(date);
}

export function formatDateTime(date: Date) {
  return `${localDay(date)} ${clockFormat.format(date)}`;
}

export function formatClockWithZone(date: Date) {
  return clockWithZoneFormat.format(date);
}

export function formatTimeAgo(date: Date, now = new Date()) {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return formatDateTime(date);
}

export function formatListeningTime(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 100) return `${hours.toLocaleString("en")} h`;
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const weekdayHourFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "long",
  hour: "2-digit",
  hourCycle: "h23",
});

export function localWeekdayHour(date: Date) {
  const parts = weekdayHourFormat.formatToParts(date);
  return {
    weekday: WEEKDAYS.indexOf(parts.find((part) => part.type === "weekday")!.value),
    hour: Number(parts.find((part) => part.type === "hour")!.value),
  };
}
