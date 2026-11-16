import { type Gain, savedGain } from "./levelling";

export type Repeat = "off" | "all" | "one";

const REPEAT_ORDER: Repeat[] = ["off", "all", "one"];

export function nextRepeat(repeat: Repeat): Repeat {
  return REPEAT_ORDER[(REPEAT_ORDER.indexOf(repeat) + 1) % REPEAT_ORDER.length];
}

function shuffle(items: number[], random: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function inOrder(length: number) {
  return Array.from({ length }, (_, i) => i);
}

export function shuffleAll(length: number, random = Math.random) {
  return shuffle(inOrder(length), random);
}

export function shuffleAfter(order: number[], position: number, random = Math.random) {
  return [...order.slice(0, position + 1), ...shuffle(order.slice(position + 1), random)];
}

export function unshuffle(order: number[], position: number) {
  const sorted = [...order].sort((a, b) => a - b);
  return { order: sorted, position: Math.max(sorted.indexOf(order[position]), 0) };
}

export function insertAfter(order: number[], position: number, index: number) {
  return [...order.slice(0, position + 1), index, ...order.slice(position + 1)];
}

export function removeAt(order: number[], position: number, at: number) {
  if (at === position || at < 0 || at >= order.length) return { order, position };
  return { order: order.filter((_, i) => i !== at), position: at < position ? position - 1 : position };
}

export const LONGEST_QUEUE = 500;

export function queueWindow(length: number, chosen: number, longest = LONGEST_QUEUE) {
  if (length <= longest) return { from: 0, to: length };
  const from = Math.min(Math.max(chosen, 0), length - longest);
  return { from, to: from + longest };
}

export function startingWith(chosen: number, shuffled: number[]) {
  return [chosen, ...shuffled.filter((index) => index !== chosen)];
}

export type SavedQueue<T> = { tracks: T[]; order: number[]; position: number; time: number };

type SavedTrack = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  songId?: string;
  newSong?: boolean;
  album?: string;
  albumHref?: string;
  gain?: Gain;
  duration?: number;
};

const LONGEST_SONG_SECONDS = 24 * 60 * 60;

export function songLength(elementDuration: number, known: number | undefined) {
  if (Number.isFinite(elementDuration) && elementDuration > 0) return elementDuration;
  return known !== undefined && Number.isFinite(known) && known > 0 ? known : Number.NaN;
}

function savedDuration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= LONGEST_SONG_SECONDS
    ? value
    : undefined;
}

const ALBUM_HREF = /^\/(album\/[^/?#]+|music\?album=[A-Za-z0-9_-]+)$/;

const SONG_ID = /^[A-Za-z0-9_-]{1,64}$/;

function isTrack(value: unknown): value is SavedTrack {
  if (typeof value !== "object" || value === null) return false;
  const track = value as Record<string, unknown>;
  return (
    typeof track.trackId === "string" &&
    typeof track.title === "string" &&
    typeof track.artist === "string" &&
    (track.cover === undefined || typeof track.cover === "string") &&
    (track.songId === undefined || (typeof track.songId === "string" && SONG_ID.test(track.songId))) &&
    (track.newSong === undefined || typeof track.newSong === "boolean") &&
    (track.album === undefined || (typeof track.album === "string" && track.album.length <= 300)) &&
    (track.albumHref === undefined || (typeof track.albumHref === "string" && ALBUM_HREF.test(track.albumHref)))
  );
}

export function restoreQueue(raw: unknown): SavedQueue<SavedTrack> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const saved = raw as Record<string, unknown>;
  if (!Array.isArray(saved.tracks) || !Array.isArray(saved.order)) return null;
  const tracks = saved.tracks.slice(0, LONGEST_QUEUE);
  if (tracks.length === 0 || !tracks.every(isTrack)) return null;
  const seen = new Set<number>();
  const order = saved.order.filter(
    (index): index is number =>
      Number.isInteger(index) && index >= 0 && index < tracks.length && !seen.has(index) && Boolean(seen.add(index)),
  );
  if (order.length === 0) return null;
  const position = Number.isInteger(saved.position)
    ? Math.min(Math.max(saved.position as number, 0), order.length - 1)
    : 0;
  const time = typeof saved.time === "number" && Number.isFinite(saved.time) && saved.time > 0 ? saved.time : 0;
  return {
    tracks: tracks.map(({ trackId, title, artist, cover, songId, newSong, album, albumHref, gain, duration }) => {
      const level = savedGain(gain);
      const length = savedDuration(duration);
      return {
        trackId,
        title,
        artist,
        ...(cover ? { cover } : {}),
        ...(songId ? { songId } : {}),
        ...(newSong ? { newSong } : {}),
        ...(album ? { album } : {}),
        ...(album && albumHref ? { albumHref } : {}),
        ...(level ? { gain: level } : {}),
        ...(length ? { duration: length } : {}),
      };
    }),
    order,
    position,
    time,
  };
}

export function nextPosition(position: number, length: number, repeat: Repeat): number | null {
  if (position + 1 < length) return position + 1;
  return repeat === "all" && length > 0 ? 0 : null;
}

const SHORTEST_SONG_SECONDS = 30;
const LONGEST_WAIT_SECONDS = 240;
const LONGEST_STEP_SECONDS = 2;

export function countsAsPlay(heardSeconds: number, songSeconds: number) {
  if (!Number.isFinite(songSeconds) || songSeconds < SHORTEST_SONG_SECONDS) return false;
  return heardSeconds >= Math.min(songSeconds / 2, LONGEST_WAIT_SECONDS);
}

export function heardStep(before: number | null, now: number) {
  if (before === null || now <= before) return 0;
  const step = now - before;
  return step <= LONGEST_STEP_SECONDS ? step : 0;
}

export const SEEK_STEP_SECONDS = 5;

export type Shortcut = "toggle" | "back" | "forward" | "previous" | "next";

export function shortcutFor(key: string, keys: { shift: boolean; other: boolean; repeat: boolean }): Shortcut | null {
  if (keys.other) return null;
  if (key === " " || key === "Spacebar") return keys.shift || keys.repeat ? null : "toggle";
  if (key === "ArrowLeft") return keys.shift ? (keys.repeat ? null : "previous") : "back";
  if (key === "ArrowRight") return keys.shift ? (keys.repeat ? null : "next") : "forward";
  return null;
}

export function seekTarget(now: number, step: number, duration: number) {
  const end = Number.isFinite(duration) ? duration : now + Math.max(step, 0);
  return Math.min(Math.max(now + step, 0), end);
}
