export const ANDROID_EVENT = "soundscape-android";

export type DownloadState = "done" | "waiting" | "failed";

export type AndroidApp = { version: string; downloads: Record<string, DownloadState> };

export type DownloadTrack = {
  trackId: string;
  songId?: string;
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  duration?: number;
};

export type DownloadRequest = { do: "download"; tracks: DownloadTrack[] } | { do: "remove"; trackIds: string[] };

export type DownloadSummary = { total: number; done: number; waiting: number; failed: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readAndroidApp(value: unknown): AndroidApp | null {
  if (!isRecord(value) || typeof value.version !== "string" || !value.version) return null;
  const downloads: Record<string, DownloadState> = {};
  if (isRecord(value.downloads)) {
    for (const [trackId, state] of Object.entries(value.downloads)) {
      if (state === "done" || state === "waiting" || state === "failed") downloads[trackId] = state;
    }
  }
  return { version: value.version, downloads };
}

export function downloadTracks(
  songs: {
    trackId: string;
    songId?: string;
    title: string;
    artist: string;
    album?: string;
    cover?: string;
    duration?: number;
  }[],
): DownloadTrack[] {
  const seen = new Set<string>();
  return songs.flatMap((song) => {
    if (seen.has(song.trackId)) return [];
    seen.add(song.trackId);
    return [
      {
        trackId: song.trackId,
        ...(song.songId ? { songId: song.songId } : {}),
        title: song.title,
        artist: song.artist,
        ...(song.album ? { album: song.album } : {}),
        ...(song.cover ? { cover: song.cover } : {}),
        ...(song.duration ? { duration: song.duration } : {}),
      },
    ];
  });
}

export function summarize(trackIds: string[], downloads: Record<string, DownloadState>): DownloadSummary {
  const summary = { total: trackIds.length, done: 0, waiting: 0, failed: 0 };
  for (const trackId of trackIds) {
    const state = downloads[trackId];
    if (state) summary[state]++;
  }
  return summary;
}
