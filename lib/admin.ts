import { type JobRun, lastRun } from "./jobs";
import { getValue, keys } from "./kv";
import type { RecentPlay } from "./live";
import { sql } from "./postgres";

export type Account = {
  username: string;
  createdAt?: Date;
  plays: number;
  lastPlay?: RecentPlay;
  private: boolean;
};

export type LibraryStatus = {
  songs: number;
  withCover: number;
  withAlbum: number;
  artists: number;
  genresChecked: number;
  withGenres: number;
  albums: number;
  plays: number;
};

export type Backup = { at: Date; file: string; size: string };

export function admins(): string[] {
  return (process.env.ADMIN_USERS ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(userId: string | null): boolean {
  return userId !== null && admins().includes(userId);
}

export async function getAccounts(): Promise<Account[]> {
  const users = await sql`
    SELECT u.username, u.created_at, u.is_private,
           (SELECT coalesce(sum(plays), 0) FROM user_track_plays WHERE user_id = u.username) AS plays,
           last.track_id, last.played_at, t.title, a.name AS artist, t.cover
    FROM users u
    LEFT JOIN LATERAL (
      SELECT track_id, played_at FROM plays WHERE user_id = u.username ORDER BY played_at DESC, id DESC LIMIT 1
    ) last ON true
    LEFT JOIN tracks t ON t.id = last.track_id
    LEFT JOIN artists a ON a.id = t.artist_id`;
  return users
    .map((user) => ({
      username: user.username as string,
      createdAt: user.created_at as Date,
      plays: user.plays as number,
      lastPlay: user.track_id
        ? ({
            trackId: user.track_id,
            title: user.title,
            artist: user.artist,
            ...(user.cover ? { cover: user.cover } : {}),
            playedAt: user.played_at.toISOString(),
          } as RecentPlay)
        : undefined,
      private: user.is_private as boolean,
    }))
    .sort((a, b) => b.plays - a.plays || a.username.localeCompare(b.username));
}

export async function getLibraryStatus(): Promise<LibraryStatus> {
  const [row] = await sql`
    SELECT (SELECT count(*) FROM tracks) AS songs,
           (SELECT count(*) FROM tracks WHERE cover IS NOT NULL) AS with_cover,
           (SELECT count(*) FROM tracks WHERE album_id IS NOT NULL) AS with_album,
           (SELECT count(*) FROM artists) AS artists,
           (SELECT count(*) FROM artists WHERE genres_checked_at IS NOT NULL) AS genres_checked,
           (SELECT count(DISTINCT artist_id) FROM artist_genres) AS with_genres,
           (SELECT count(*) FROM albums) AS albums,
           (SELECT count(*) FROM plays) AS plays`;
  return {
    songs: row.songs,
    withCover: row.with_cover,
    withAlbum: row.with_album,
    artists: row.artists,
    genresChecked: row.genres_checked,
    withGenres: row.with_genres,
    albums: row.albums,
    plays: row.plays,
  };
}

export async function getLastBackup(): Promise<Backup | null> {
  const value = await getValue<string>(keys.lastBackup);
  if (!value) return null;
  const [at, file, size] = value.split("|");
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : { at: date, file: file ?? "", size: size ?? "" };
}

export type JobStatus = { name: string; label: string; everyMinutes: number; last: JobRun | null; waiting?: number };

const JOBS = [
  { name: "genres", label: "Genres from MusicBrainz", everyMinutes: 60 },
  { name: "artist-photos", label: "Artist photos from Deezer", everyMinutes: 60 },
  { name: "artist-info", label: "Artist info from MusicBrainz and Wikipedia", everyMinutes: 60 },
  { name: "notifications", label: "Notifications for milestones and leaderboard passes", everyMinutes: 5 },
  { name: "cleanup", label: "Removing expired sessions and caches", everyMinutes: 10 },
];

export async function getJobStatus(): Promise<{ jobs: JobStatus[]; relayQueued: number }> {
  const [[waiting], runs] = await Promise.all([
    sql`
      WITH played AS (
        SELECT DISTINCT a.id, a.mbid, a.genres_checked_at, a.photo_checked_at, a.info_checked_at
        FROM user_track_plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
      )
      SELECT count(*) FILTER (WHERE genres_checked_at IS NULL) AS genres,
             count(*) FILTER (WHERE photo_checked_at IS NULL) AS photos,
             count(*) FILTER (WHERE mbid IS NOT NULL AND info_checked_at IS NULL) AS info,
             (SELECT count(*) FROM relay_queue) AS relay
      FROM played`,
    Promise.all(JOBS.map((job) => lastRun(job.name))),
  ]);
  const backlog: Record<string, number> = {
    genres: waiting.genres,
    "artist-photos": waiting.photos,
    "artist-info": waiting.info,
  };
  return {
    jobs: JOBS.map((job, i) => ({ ...job, last: runs[i], waiting: backlog[job.name] })),
    relayQueued: waiting.relay,
  };
}
