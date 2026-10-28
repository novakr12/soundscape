import { findAllInLibrary, getNavidrome, type LibrarySong, NavidromeError, savePlaylist } from "./navidrome";
import { sql } from "./postgres";
import { getRecommendations } from "./recommendations";
import { getWanted, removeWanted } from "./wanted";

export const MIX_SIZE = 25;
export const REDISCOVER_AFTER_DAYS = 90;
const SONGS_PER_ARTIST = 2;

export type MixKind = "discover" | "rediscover";

export const PLAYLIST_NAMES: Record<MixKind, string> = {
  discover: "Soundscape Discover",
  rediscover: "Soundscape Rediscover",
};

export type MixSong = LibrarySong & {
  cover?: string;
  deezerId?: number;
  plays?: number;
  lastPlayed?: Date;
  via?: string[];
};

export type SavedMix = {
  playlist: string;
  found: string[];
  missing: string[];
  arrived: LibrarySong[];
};

export async function trackDetails(trackIds: string[]) {
  const rows = await sql`SELECT id, cover, deezer_id FROM tracks WHERE id = ANY(${trackIds})`;
  return new Map(
    rows.map((row) => [
      row.id as string,
      { cover: (row.cover as string | null) ?? undefined, deezerId: (row.deezer_id as number | null) ?? undefined },
    ]),
  );
}

export async function getDiscoverMix(userId: string): Promise<MixSong[]> {
  const recommendations = await getRecommendations(userId, MIX_SIZE);
  const details = await trackDetails(recommendations.map((r) => r.trackId));
  return recommendations.map((r) => ({
    trackId: r.trackId,
    title: r.title,
    artist: r.artist,
    cover: r.cover,
    deezerId: details.get(r.trackId)?.deezerId,
    via: r.via,
  }));
}

export async function getRediscoverMix(userId: string, now = new Date()): Promise<MixSong[]> {
  const rows = await sql`
    SELECT p.track_id, t.title, a.name AS artist, count(*) AS plays, max(p.played_at) AS last_played
    FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ${userId}
    GROUP BY p.track_id, t.id, a.id
    HAVING count(*) >= 2 AND max(p.played_at) < ${new Date(now.getTime() - REDISCOVER_AFTER_DAYS * 86_400_000)}`;
  const songs = rows.map((row) => ({
    trackId: row.track_id as string,
    title: row.title as string,
    artist: row.artist as string,
    plays: row.plays as number,
    lastPlayed: row.last_played as Date,
  }));

  const perArtist = new Map<string, number>();
  const picked = songs
    .sort((a, b) => b.plays - a.plays || a.lastPlayed.getTime() - b.lastPlayed.getTime())
    .filter((song) => {
      const count = perArtist.get(song.artist) ?? 0;
      perArtist.set(song.artist, count + 1);
      return count < SONGS_PER_ARTIST;
    })
    .slice(0, MIX_SIZE);

  const details = await trackDetails(picked.map((song) => song.trackId));
  return picked.map((song) => ({ ...song, ...details.get(song.trackId) }));
}

export function getMix(userId: string, kind: MixKind, now = new Date()) {
  return kind === "discover" ? getDiscoverMix(userId) : getRediscoverMix(userId, now);
}

async function connected(userId: string) {
  const server = await getNavidrome(userId);
  if (!server) throw new NavidromeError("Connect Navidrome on the Connect page first.");
  return server;
}

export async function saveMixToNavidrome(userId: string, kind: MixKind, now = new Date()): Promise<SavedMix> {
  const server = await connected(userId);
  const songs = await getMix(userId, kind, now);
  const inMix = new Set(songs.map((song) => song.trackId));
  const wanted = (await getWanted(userId)).filter((song) => !inMix.has(song.trackId));
  const found = await findAllInLibrary(server, [...songs, ...wanted]);
  const arrived = wanted.filter((song) => found.has(song.trackId));

  const songIds = [...songs, ...arrived].flatMap((song) => found.get(song.trackId) ?? []);
  if (songIds.length > 0) await savePlaylist(server, PLAYLIST_NAMES[kind], songIds);
  await removeWanted(userId, [...found.keys()]);

  return {
    playlist: PLAYLIST_NAMES[kind],
    found: songs.filter((song) => found.has(song.trackId)).map((song) => song.trackId),
    missing: songs.filter((song) => !found.has(song.trackId)).map((song) => song.trackId),
    arrived: arrived.map(({ trackId, title, artist }) => ({ trackId, title, artist })),
  };
}

export async function checkWantedInNavidrome(userId: string): Promise<LibrarySong[]> {
  const server = await connected(userId);
  const wanted = await getWanted(userId);
  const found = await findAllInLibrary(server, wanted);
  await removeWanted(userId, [...found.keys()]);
  return wanted
    .filter((song) => found.has(song.trackId))
    .map(({ trackId, title, artist }) => ({ trackId, title, artist }));
}
