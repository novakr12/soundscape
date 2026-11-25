import { isSongId } from "./catalog";
import type { LibrarySong } from "./navidrome";

export const MAX_PLAYLIST_NAME = 100;
export const MAX_QUEUE_PLAYLIST_TRACKS = 500;
const MAX_TRACK_TEXT = 300;

export type QueuePlaylistTrack = {
  trackId: string;
  title: string;
  artist: string;
  songId?: string;
};

export type QueueSaveResult = {
  name: string;
  saved: number;
  total: number;
  missing: number;
};

function trimmedText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function readQueueTrack(value: unknown): QueuePlaylistTrack | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const trackId = trimmedText(entry.trackId, MAX_TRACK_TEXT);
  const title = trimmedText(entry.title, MAX_TRACK_TEXT);
  const artist = trimmedText(entry.artist, MAX_TRACK_TEXT);
  if (!trackId || !title || !artist) return null;
  const songId = typeof entry.songId === "string" && isSongId(entry.songId) ? entry.songId : undefined;
  return {
    trackId,
    title,
    artist,
    ...(songId ? { songId } : {}),
  };
}

export function readQueuePlaylistRequest(body: unknown): { name: string; tracks: QueuePlaylistTrack[] } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const name = trimmedText(record.name, MAX_PLAYLIST_NAME);
  if (!name || !Array.isArray(record.tracks)) return null;
  const tracks = record.tracks
    .slice(0, MAX_QUEUE_PLAYLIST_TRACKS)
    .map(readQueueTrack)
    .filter((track): track is QueuePlaylistTrack => track !== null);
  if (tracks.length === 0) return null;
  return { name, tracks };
}

export function missingLibrarySongs(tracks: readonly QueuePlaylistTrack[]): LibrarySong[] {
  const seen = new Set<string>();
  const missing: LibrarySong[] = [];
  for (const track of tracks) {
    if (track.songId || seen.has(track.trackId)) continue;
    seen.add(track.trackId);
    missing.push({ trackId: track.trackId, title: track.title, artist: track.artist });
  }
  return missing;
}

export function resolveQueueSongIds(
  tracks: readonly QueuePlaylistTrack[],
  found: ReadonlyMap<string, string>,
): { songIds: string[]; missing: number } {
  const songIds: string[] = [];
  let missing = 0;
  for (const track of tracks) {
    const songId = track.songId ?? found.get(track.trackId);
    if (songId) songIds.push(songId);
    else missing++;
  }
  return { songIds, missing };
}

export function formatQueueSaved(result: QueueSaveResult): string {
  if (result.missing === 0) {
    return `Saved ${result.saved} ${result.saved === 1 ? "song" : "songs"} to “${result.name}”`;
  }
  return `Saved ${result.saved} of ${result.total} songs to “${result.name}” (${result.missing} not in Navidrome)`;
}
