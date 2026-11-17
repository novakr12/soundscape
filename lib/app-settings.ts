export const APP_SETTINGS_EVENT = "soundscape-app-settings";

export const APP_OPTIONS = [
  "scrobbling",
  "notifications",
  "weekly_recap",
  "streak_reminder",
  "yearscape_notification",
  "update_notice",
  "discord",
  "autostart",
  "keep_running",
  "native_player",
] as const;

export type AppOption = (typeof APP_OPTIONS)[number];

export type AppPlayer = { id: string; name: string; enabled: boolean; open: boolean };

export type AppSettings = Record<AppOption, boolean> & {
  connected: boolean;
  discord_app_id: string | null;
  waiting: number;
  listening: string | null;
  players: AppPlayer[];
  paused_minutes: number | null;
  version: string;
  update: string | null;
};

export type AppPush = { settings: AppSettings; error: string | null };

export type AppCommand =
  | { do: "option"; name: AppOption; value: boolean }
  | { do: "player"; id: string; value: boolean }
  | { do: "discord-app"; id: string }
  | { do: "pause" }
  | { do: "send-now" }
  | { do: "test-notification" }
  | { do: "download" }
  | { do: "window" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function player(value: unknown): AppPlayer | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  return { id: value.id, name: value.name, enabled: value.enabled === true, open: value.open === true };
}

export function readAppPush(value: unknown): AppPush | null {
  if (!isRecord(value) || !isRecord(value.settings)) return null;
  const raw = value.settings;
  if (raw.app === "android") return null;
  const version = text(raw.version);
  if (!version) return null;
  const options = Object.fromEntries(APP_OPTIONS.map((name) => [name, raw[name] === true])) as Record<
    AppOption,
    boolean
  >;
  return {
    settings: {
      ...options,
      connected: raw.connected === true,
      discord_app_id: text(raw.discord_app_id),
      waiting: count(raw.waiting) ?? 0,
      listening: text(raw.listening),
      players: (Array.isArray(raw.players) ? raw.players : []).flatMap((each) => player(each) ?? []),
      paused_minutes: count(raw.paused_minutes),
      version,
      update: text(raw.update),
    },
    error: text(value.error),
  };
}

export function scrobblingStatus(settings: AppSettings) {
  const paused = settings.paused_minutes;
  if (!settings.scrobbling) return "Scrobbling is off.";
  if (paused)
    return `Paused for ${paused === 1 ? "1 more minute" : `${paused} more minutes`}. It turns back on by itself.`;
  if (settings.listening) return `Listening now: ${settings.listening}`;
  return "Nothing playing right now.";
}

export function waitingStatus(waiting: number) {
  if (waiting === 0) return "No plays waiting to be sent.";
  return `${waiting.toLocaleString("en")} ${waiting === 1 ? "play" : "plays"} waiting to be sent.`;
}

export const ANDROID_OPTIONS = [
  "background_playback",
  "notifications",
  "downloads_wifi_only",
  "weekly_recap",
  "streak_reminder",
  "update_notice",
] as const;

export type AndroidOption = (typeof ANDROID_OPTIONS)[number];

export type AndroidSettings = Record<AndroidOption, boolean> & {
  version: string;
  connected: boolean;
  user: string | null;
  notifications_allowed: boolean;
  downloads: string | null;
  update: string | null;
  extras: boolean;
};

export type AndroidPush = { settings: AndroidSettings; error: string | null };

export type AndroidCommand =
  | { do: "option"; name: AndroidOption; value: boolean }
  | { do: "connect" }
  | { do: "disconnect" }
  | { do: "change-server" }
  | { do: "notification-settings" }
  | { do: "open-downloads" }
  | { do: "download-update" };

export function readAndroidPush(value: unknown): AndroidPush | null {
  if (!isRecord(value) || !isRecord(value.settings)) return null;
  const raw = value.settings;
  if (raw.app !== "android") return null;
  const version = text(raw.version);
  if (!version) return null;
  return {
    settings: {
      version,
      connected: raw.connected === true,
      user: text(raw.user),
      background_playback: raw.background_playback === true,
      notifications: raw.notifications === true,
      notifications_allowed: raw.notifications_allowed === true,
      downloads_wifi_only: raw.downloads_wifi_only === true,
      downloads: text(raw.downloads),
      weekly_recap: raw.weekly_recap !== false,
      streak_reminder: raw.streak_reminder === true,
      update_notice: raw.update_notice !== false,
      update: text(raw.update),
      extras: typeof raw.weekly_recap === "boolean",
    },
    error: text(value.error),
  };
}
