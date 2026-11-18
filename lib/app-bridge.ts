import { type HandedTrack, MOST_HANDED_TRACKS, readHandedTrack } from "./devices";
import { type Gain, gainLevel, playingAnAlbum } from "./levelling";

export type BridgeTrackInput = {
  trackId: string;
  songId?: string;
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  gain?: Gain;
  duration?: number;
};

export type BridgeTrack = {
  trackId: string;
  songId: string | null;
  title: string;
  artist: string;
  album: string | null;
  cover: string | null;
  duration: number | null;
  level: number;
};

export type BridgeCommand = "play" | "pause" | "toggle" | "next" | "previous" | "seek";

export type HandBack = { position: number; time: number; playing: boolean; tracks: HandedTrack[] | null };

export const BRIDGE_VERSION = 1;

export function bridgeTracks(inPlayOrder: BridgeTrackInput[], levelling: boolean): BridgeTrack[] {
  return inPlayOrder.map((track, at) => ({
    trackId: track.trackId,
    songId: track.songId ?? null,
    title: track.title,
    artist: track.artist,
    album: track.album ?? null,
    cover: track.cover ?? null,
    duration: typeof track.duration === "number" && track.duration > 0 ? track.duration : null,
    level: levelling ? gainLevel(track.gain, playingAnAlbum(inPlayOrder, at)) : 1,
  }));
}

export function readHandBack(value: unknown, length: number): HandBack | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const position = raw.position;
  const time = raw.time;
  const tracks = Array.isArray(raw.tracks)
    ? raw.tracks
        .slice(0, MOST_HANDED_TRACKS)
        .map(readHandedTrack)
        .filter((track): track is HandedTrack => track !== null)
    : null;
  if (tracks !== null && tracks.length === 0) return null;
  const size = tracks?.length ?? length;
  if (typeof position !== "number" || !Number.isInteger(position) || position < 0 || position >= size) return null;
  return {
    position,
    time: typeof time === "number" && Number.isFinite(time) && time > 0 ? time : 0,
    playing: raw.playing === true,
    tracks,
  };
}

export function readCommand(name: unknown): BridgeCommand | null {
  return name === "play" ||
    name === "pause" ||
    name === "toggle" ||
    name === "next" ||
    name === "previous" ||
    name === "seek"
    ? name
    : null;
}

export function savedVolume(text: string | null) {
  try {
    const saved = JSON.parse(text ?? "null") as { volume?: unknown; muted?: unknown } | null;
    if (saved?.muted === true) return 0;
    return typeof saved?.volume === "number" && saved.volume >= 0 && saved.volume <= 1 ? saved.volume : 0.8;
  } catch {
    return 0.8;
  }
}
