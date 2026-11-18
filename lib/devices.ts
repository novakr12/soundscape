export const DEVICE_KINDS = ["browser", "desktop", "android"] as const;

export type DeviceKind = (typeof DEVICE_KINDS)[number];

export type DeviceTrack = {
  trackId: string;
  title: string;
  artist: string;
  album: string | null;
  cover: string | null;
  songId: string | null;
};

export type DeviceState = {
  track: DeviceTrack | null;
  playing: boolean;
  time: number;
  duration: number | null;
  volume: number;
  blocked: boolean;
};

export type Device = {
  id: string;
  name: string;
  kind: DeviceKind;
  state: DeviceState;
  at: number;
};

export type HandedTrack = {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  albumHref?: string;
  cover?: string;
  songId?: string;
  duration?: number;
};

export type DeviceCommand =
  | { do: "play" | "pause" | "toggle" | "next" | "previous" }
  | { do: "seek"; time: number }
  | { do: "volume"; volume: number }
  | { do: "take"; tracks: HandedTrack[]; position: number; time: number; playing: boolean }
  | { do: "send"; to: string };

export const DEVICE_ONLINE_MS = 150_000;
export const DEVICE_HEARTBEAT_MS = 30_000;
export const COMMAND_KEEP_MS = 30_000;
export const MOST_HANDED_TRACKS = 500;
const LONGEST_TEXT = 300;
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, longest = LONGEST_TEXT) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, longest) : null;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID.test(value);
}

export function readDeviceTrack(value: unknown): DeviceTrack | null {
  if (!isRecord(value)) return null;
  const trackId = text(value.trackId);
  const title = text(value.title);
  const artist = text(value.artist);
  if (!trackId || !title || !artist) return null;
  const cover = text(value.cover, 1000);
  return {
    trackId,
    title,
    artist,
    album: text(value.album),
    cover: cover?.startsWith("/") || cover?.startsWith("https://") ? cover : null,
    songId: text(value.songId, 100),
  };
}

export function readDeviceState(value: unknown): DeviceState {
  const raw = isRecord(value) ? value : {};
  const time = finite(raw.time);
  const duration = finite(raw.duration);
  const volume = finite(raw.volume);
  const track = readDeviceTrack(raw.track);
  return {
    track,
    playing: track !== null && raw.playing === true,
    time: time !== null && time > 0 ? time : 0,
    duration: duration !== null && duration > 0 ? duration : null,
    volume: volume !== null ? Math.min(Math.max(volume, 0), 1) : 0.8,
    blocked: raw.blocked === true,
  };
}

export function readDeviceReport(
  value: unknown,
): { id: string; name: string; kind: DeviceKind; state: DeviceState } | null {
  if (!isRecord(value) || !isDeviceId(value.id)) return null;
  const name = text(value.name, 60);
  const kind = DEVICE_KINDS.find((each) => each === value.kind);
  if (!name || !kind) return null;
  return { id: value.id, name, kind, state: readDeviceState(value.state) };
}

export function readHandedTrack(value: unknown): HandedTrack | null {
  const track = readDeviceTrack(value);
  if (!track || !isRecord(value)) return null;
  const duration = finite(value.duration);
  const albumHref = text(value.albumHref, 1000);
  return {
    trackId: track.trackId,
    title: track.title,
    artist: track.artist,
    ...(track.album ? { album: track.album } : {}),
    ...(albumHref?.startsWith("/") ? { albumHref } : {}),
    ...(track.cover ? { cover: track.cover } : {}),
    ...(track.songId ? { songId: track.songId } : {}),
    ...(duration !== null && duration > 0 ? { duration } : {}),
  };
}

export function readDeviceCommand(value: unknown): DeviceCommand | null {
  if (!isRecord(value)) return null;
  const name = value.do;
  if (name === "play" || name === "pause" || name === "toggle" || name === "next" || name === "previous") {
    return { do: name };
  }
  if (name === "seek") {
    const time = finite(value.time);
    return time !== null && time >= 0 ? { do: "seek", time } : null;
  }
  if (name === "volume") {
    const volume = finite(value.volume);
    return volume !== null && volume >= 0 && volume <= 1 ? { do: "volume", volume } : null;
  }
  if (name === "send") {
    return isDeviceId(value.to) ? { do: "send", to: value.to } : null;
  }
  if (name === "take") {
    if (!Array.isArray(value.tracks)) return null;
    const tracks = value.tracks
      .slice(0, MOST_HANDED_TRACKS)
      .map(readHandedTrack)
      .filter((track): track is HandedTrack => track !== null);
    const position = finite(value.position);
    if (tracks.length === 0 || position === null || !Number.isInteger(position)) return null;
    if (position < 0 || position >= tracks.length) return null;
    const time = finite(value.time);
    return {
      do: "take",
      tracks,
      position,
      time: time !== null && time > 0 ? time : 0,
      playing: value.playing !== false,
    };
  }
  return null;
}

export function isOnline(device: { at: number }, now: number) {
  return now - device.at < DEVICE_ONLINE_MS;
}

export function timeNow(state: DeviceState, at: number, now: number) {
  const moved = state.playing ? Math.max(0, now - at) / 1000 : 0;
  const time = state.time + moved;
  return state.duration ? Math.min(time, state.duration) : time;
}

export function deviceKind(view: { soundscapeDesktop?: unknown }, userAgent: string): DeviceKind {
  if (view.soundscapeDesktop) return "desktop";
  if (userAgent.includes("SoundscapeAndroid/")) return "android";
  return "browser";
}

function browserName(userAgent: string) {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/OPR\//.test(userAgent)) return "Opera";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Browser";
}

function systemName(userAgent: string) {
  if (/Android/.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iPhone";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/.test(userAgent)) return "Mac";
  if (/CrOS/.test(userAgent)) return "ChromeOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return null;
}

export function deviceName(kind: DeviceKind, userAgent: string) {
  if (kind === "desktop") return "Soundscape desktop";
  if (kind === "android") return "Soundscape on Android";
  const system = systemName(userAgent);
  return system ? `${browserName(userAgent)} on ${system}` : browserName(userAgent);
}

export type Guess = { playing?: boolean; time?: number; since: number };

export const GUESS_KEEP_MS = 4000;

export function shownPlayback(device: Device, serverNow: number, guess: Guess | null, now: number) {
  const fresh = guess && now - guess.since < GUESS_KEEP_MS ? guess : null;
  const playing = fresh?.playing ?? device.state.playing;
  if (fresh?.time === undefined) {
    const time = timeNow({ ...device.state, playing }, device.at, serverNow);
    return { playing, time };
  }
  const moved = playing ? Math.max(0, now - fresh.since) / 1000 : 0;
  const time = fresh.time + moved;
  return { playing, time: device.state.duration ? Math.min(time, device.state.duration) : time };
}

export type AppView = { soundscapeDeviceId?: unknown; soundscapeDeviceName?: unknown; soundscapeDeviceHeld?: unknown };

export function givenDevice(view: AppView) {
  return {
    id: isDeviceId(view.soundscapeDeviceId) ? view.soundscapeDeviceId : null,
    name: text(view.soundscapeDeviceName, 60),
  };
}

export function isHeld(view: AppView) {
  return view.soundscapeDeviceHeld === true;
}

export function newDeviceId(random: () => number = Math.random) {
  const letters = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 20 }, () => letters[Math.floor(random() * letters.length)]).join("");
}

export function nowPlayingLine(device: Device) {
  const track = device.state.track;
  if (!track) return "Nothing playing";
  return `${track.title} · ${track.artist}`;
}
