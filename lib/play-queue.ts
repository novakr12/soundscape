import { isSongId } from "./catalog";
import { type Gain, savedGain } from "./levelling";
import { shuffled } from "./shuffle";

export type Repeat = "off" | "all" | "one";

const REPEAT_ORDER: Repeat[] = ["off", "all", "one"];

export function nextRepeat(repeat: Repeat): Repeat {
  return REPEAT_ORDER[(REPEAT_ORDER.indexOf(repeat) + 1) % REPEAT_ORDER.length];
}

export function inOrder(length: number) {
  return Array.from({ length }, (_, i) => i);
}

export function shuffleAll(length: number, random = Math.random) {
  return shuffled(inOrder(length), random);
}

export function shuffleAfter(order: number[], position: number, random = Math.random) {
  return [...order.slice(0, position + 1), ...shuffled(order.slice(position + 1), random)];
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

export function moveAt(order: number[], position: number, from: number, to: number) {
  if (
    from === to ||
    from === position ||
    to === position ||
    from < 0 ||
    to < 0 ||
    from >= order.length ||
    to >= order.length
  ) {
    return { order, position };
  }
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  const nextPosition =
    from < position && to >= position ? position - 1 : from > position && to <= position ? position + 1 : position;
  return { order: next, position: nextPosition };
}

export function compactTracks<T>(tracks: readonly T[], order: readonly number[]) {
  const used = new Set(order);
  const remap = new Map<number, number>();
  const kept: T[] = [];
  tracks.forEach((track, index) => {
    if (!used.has(index)) return;
    remap.set(index, kept.length);
    kept.push(track);
  });
  return { tracks: kept, order: order.map((index) => remap.get(index)!) };
}

export function trimPlayed<T>(
  tracks: readonly T[],
  order: readonly number[],
  position: number,
  keepBefore = 25,
  fromLength = 100,
) {
  if (order.length <= fromLength || position <= keepBefore) {
    return { tracks: [...tracks], order: [...order], position, dropped: [] as T[] };
  }
  const cut = position - keepBefore;
  const keptOrder = order.slice(cut);
  const used = new Set(keptOrder);
  const dropped = tracks.filter((_, index) => !used.has(index));
  const compacted = compactTracks(tracks, keptOrder);
  return { ...compacted, position: keepBefore, dropped };
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
  artistHref?: string;
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

const ALBUM_HREF = /^\/(album\/[^/?#]+(\?[^#]+)?|music\?(album|q)=[^#]+)$/;
const ARTIST_HREF = /^\/(artist\/[^/?#]+(\?name=[^#]+)?|music\?(artist|q)=[^#]+)$/;

function isTrack(value: unknown): value is SavedTrack {
  if (typeof value !== "object" || value === null) return false;
  const track = value as Record<string, unknown>;
  return (
    typeof track.trackId === "string" &&
    typeof track.title === "string" &&
    typeof track.artist === "string" &&
    (track.cover === undefined || typeof track.cover === "string") &&
    (track.songId === undefined || (typeof track.songId === "string" && isSongId(track.songId))) &&
    (track.newSong === undefined || typeof track.newSong === "boolean") &&
    (track.album === undefined || (typeof track.album === "string" && track.album.length <= 300)) &&
    (track.albumHref === undefined ||
      (typeof track.albumHref === "string" && track.albumHref.length <= 1000 && ALBUM_HREF.test(track.albumHref))) &&
    (track.artistHref === undefined ||
      (typeof track.artistHref === "string" && track.artistHref.length <= 1000 && ARTIST_HREF.test(track.artistHref)))
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
    tracks: tracks.map(
      ({ trackId, title, artist, cover, songId, newSong, album, albumHref, artistHref, gain, duration }) => {
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
          ...(artistHref ? { artistHref } : {}),
          ...(level ? { gain: level } : {}),
          ...(length ? { duration: length } : {}),
        };
      },
    ),
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

export type Shortcut =
  | "toggle"
  | "back"
  | "forward"
  | "previous"
  | "next"
  | "mute"
  | "volume-up"
  | "volume-down"
  | "lyrics"
  | "queue"
  | "theater"
  | "shuffle"
  | "repeat"
  | "help";

export function shortcutFor(key: string, keys: { shift: boolean; other: boolean; repeat: boolean }): Shortcut | null {
  if (keys.other) return null;
  if (key === "?") return keys.repeat ? null : "help";
  if (key === " " || key === "Spacebar") return keys.shift || keys.repeat ? null : "toggle";
  if (key === "ArrowLeft") return keys.shift ? (keys.repeat ? null : "previous") : "back";
  if (key === "ArrowRight") return keys.shift ? (keys.repeat ? null : "next") : "forward";
  if (key === "ArrowUp") return keys.shift ? "volume-up" : null;
  if (key === "ArrowDown") return keys.shift ? "volume-down" : null;
  if (keys.shift || keys.repeat) return null;
  switch (key.toLowerCase()) {
    case "m":
      return "mute";
    case "l":
      return "lyrics";
    case "q":
      return "queue";
    case "f":
      return "theater";
    case "s":
      return "shuffle";
    case "r":
      return "repeat";
    default:
      return null;
  }
}

export function seekTarget(now: number, step: number, duration: number) {
  const end = Number.isFinite(duration) ? duration : now + Math.max(step, 0);
  return Math.min(Math.max(now + step, 0), end);
}

export const LOCK_SCREEN_SKIP_SECONDS = 10;

export function lockScreenPosition(duration: number, position: number, rate: number) {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const at = Number.isFinite(position) ? Math.min(Math.max(position, 0), duration) : 0;
  return { duration, position: at, playbackRate: Number.isFinite(rate) && rate > 0 ? rate : 1 };
}
