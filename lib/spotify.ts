import { type FileListen, MIN_PLAYED_MS, text } from "./file-import";

export type SpotifyHistory = { listens: FileListen[]; podcasts: number; short: number; private: number };

type ExtendedEntry = {
  ts?: string;
  ms_played?: number;
  master_metadata_track_name?: string | null;
  master_metadata_album_artist_name?: string | null;
  master_metadata_album_album_name?: string | null;
  episode_name?: string | null;
  audiobook_title?: string | null;
  incognito_mode?: boolean | null;
};

type AccountEntry = { endTime?: string; artistName?: string; trackName?: string; msPlayed?: number };

export function readSpotifyHistory(data: unknown): SpotifyHistory {
  const history: SpotifyHistory = { listens: [], podcasts: 0, short: 0, private: 0 };
  if (!Array.isArray(data)) throw new Error("This isn't a Spotify streaming history file.");

  for (const entry of data as (ExtendedEntry & AccountEntry)[]) {
    if (!entry || typeof entry !== "object") continue;
    const extended = "ts" in entry;
    const artist = text(extended ? entry.master_metadata_album_artist_name : entry.artistName);
    const title = text(extended ? entry.master_metadata_track_name : entry.trackName);
    const msPlayed = Number(extended ? entry.ms_played : entry.msPlayed) || 0;
    const ended = Date.parse(extended ? String(entry.ts) : `${String(entry.endTime).replace(" ", "T")}:00Z`);

    if (!artist || !title || entry.episode_name || entry.audiobook_title) {
      history.podcasts++;
      continue;
    }
    if (entry.incognito_mode === true) {
      history.private++;
      continue;
    }
    if (msPlayed < MIN_PLAYED_MS || Number.isNaN(ended)) {
      history.short++;
      continue;
    }
    const album = text(entry.master_metadata_album_album_name);
    history.listens.push({ artist, title, playedAt: ended - msPlayed, ...(album ? { album } : {}) });
  }
  return history;
}
