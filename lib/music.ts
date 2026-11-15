import type { PlayerTrack } from "@/components/player";
import { linkAlbums } from "./albums";
import { resolveTracks } from "./aliases";
import { songArtist, songTitle } from "./catalog";
import { saveTracks } from "./imports";
import { getNavidrome, getSong, type NavidromeSong } from "./navidrome";
import { sql } from "./postgres";

export type MusicSong = PlayerTrack & { album?: string; duration?: number };

export function navidromeCover(coverArt: string | undefined) {
  return coverArt ? `/api/navidrome/cover/${encodeURIComponent(coverArt)}` : undefined;
}

export async function toMusicSongs(songs: NavidromeSong[]): Promise<MusicSong[]> {
  if (songs.length === 0) return [];
  const resolved = await resolveTracks(songs);
  const ids = [...new Set(resolved.map((song) => song.trackId))];
  const known = new Set((await sql`SELECT id FROM tracks WHERE id = ANY(${ids})`).map((row) => row.id as string));
  return songs.map((song, i) => {
    const trackId = resolved[i].trackId;
    const cover = navidromeCover(song.coverArt);
    return {
      trackId,
      songId: song.id,
      title: song.title,
      artist: song.artist,
      ...(cover ? { cover } : {}),
      ...(known.has(trackId) ? {} : { newSong: true }),
      ...(song.album ? { album: song.album } : {}),
      ...(song.duration ? { duration: song.duration } : {}),
    };
  });
}

export async function saveNavidromeSong(userId: string, songId: string): Promise<string | null> {
  const server = await getNavidrome(userId);
  if (!server) return null;
  const song = await getSong(server, songId);
  if (!song) return null;
  const [{ trackId, artistId }] = await resolveTracks([song]);
  await saveTracks([
    {
      trackId,
      title: songTitle(song.title),
      artistId,
      artist: songArtist(song.artist),
      durationMs: song.duration ? Math.round(song.duration * 1000) : null,
    },
  ]);
  if (song.album) await linkAlbums([{ trackId, album: song.album, number: song.track }]);
  return trackId;
}
