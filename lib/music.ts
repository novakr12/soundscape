import type { PlayerTrack } from "@/components/player";
import { cleanAlbum, linkAlbums } from "./albums";
import { resolveTracks } from "./aliases";
import { artistIdFor, mainArtist, slug, songArtist, songTitle } from "./catalog";
import { saveTracks } from "./imports";
import { getNavidrome } from "./navidrome";
import {
  findNavidromeAlbum,
  findNavidromeArtist,
  getLibrarySongs,
  getSong,
  type NavidromeSong,
} from "./navidrome-library";
import { sql } from "./postgres";

export type MusicSong = PlayerTrack & { album?: string; duration?: number; artistHref?: string; albumHref?: string };

export function navidromeCover(coverArt: string | undefined) {
  return coverArt ? `/api/navidrome/cover/${encodeURIComponent(coverArt)}` : undefined;
}

function musicAddress(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `/music?${query}`;
}

export async function toMusicSongs(songs: NavidromeSong[], from: { library?: string } = {}): Promise<MusicSong[]> {
  if (songs.length === 0) return [];
  const resolved = await resolveTracks(songs);
  const ids = [...new Set(resolved.map((song) => song.trackId))];
  const albumIds = songs.map((song, i) => (song.album ? albumKey(resolved[i].artistId, song.album) : null));
  const primaryAlbumIds = songs.map((song, i) => {
    if (!song.album) return null;
    const primaryArtistId = artistIdFor(mainArtist(song.artist));
    return primaryArtistId && primaryArtistId !== resolved[i].artistId ? albumKey(primaryArtistId, song.album) : null;
  });
  const uniqueAlbumIds = [...new Set([...albumIds, ...primaryAlbumIds].filter((id): id is string => Boolean(id)))];
  const [tracks, artists, albums] = await Promise.all([
    sql`SELECT id FROM tracks WHERE id = ANY(${ids})`,
    sql`SELECT id FROM artists WHERE id = ANY(${[...new Set(resolved.map((song) => song.artistId))]})`,
    sql`SELECT id FROM albums WHERE id = ANY(${uniqueAlbumIds})`,
  ]);
  const known = new Set(tracks.map((row) => row.id as string));
  const knownArtists = new Set(artists.map((row) => row.id as string));
  const knownAlbums = new Set(albums.map((row) => row.id as string));
  return songs.map((song, i) => {
    const trackId = resolved[i].trackId;
    const artistId = resolved[i].artistId;
    const albumId = albumIds[i];
    const primaryAlbumId = primaryAlbumIds[i];
    const resolvedAlbumId =
      albumId && knownAlbums.has(albumId)
        ? albumId
        : primaryAlbumId && knownAlbums.has(primaryAlbumId)
          ? primaryAlbumId
          : null;
    const cover = navidromeCover(song.coverArt);
    const artistHref = knownArtists.has(artistId)
      ? `/artist/${encodeURIComponent(artistId)}`
      : song.artistId
        ? musicAddress({ artist: song.artistId, library: from.library })
        : musicAddress({ q: song.artist, library: from.library });
    const albumHref = resolvedAlbumId
      ? `/album/${encodeURIComponent(resolvedAlbumId)}`
      : song.albumId
        ? `/music?album=${encodeURIComponent(song.albumId)}`
        : undefined;
    return {
      trackId,
      songId: song.id,
      title: song.title,
      artist: song.artist,
      ...(cover ? { cover } : {}),
      ...(known.has(trackId) ? {} : { newSong: true }),
      ...(song.album ? { album: song.album } : {}),
      ...(song.duration ? { duration: song.duration } : {}),
      artistHref,
      ...(albumHref ? { albumHref } : {}),
      ...(song.gain ? { gain: song.gain } : {}),
    };
  });
}

export function albumKey(artistId: string, album: string) {
  const title = slug(cleanAlbum(album));
  return title ? `${artistId}-${title}` : null;
}

function titleKey(title: string) {
  return slug(songTitle(title));
}

export function matchAlbumSongs<T extends { title: string }>(tracks: T[], songs: NavidromeSong[]) {
  const left = [...songs];
  const matched = tracks.map((track) => {
    const at = left.findIndex((song) => titleKey(song.title) === titleKey(track.title));
    return at >= 0 ? left.splice(at, 1)[0] : undefined;
  });
  return { matched, extra: left };
}

export async function navidromeSongsFor(userId: string, query: string, size: number) {
  const server = await getNavidrome(userId);
  if (!server) return null;
  try {
    return await toMusicSongs(await getLibrarySongs(server, { query, offset: 0, size }));
  } catch {
    return null;
  }
}

export async function navidromeAlbumFor(userId: string, artist: string, title: string) {
  const server = await getNavidrome(userId);
  if (!server) return null;
  try {
    return await findNavidromeAlbum(server, artist, title);
  } catch {
    return null;
  }
}

export async function navidromeArtistFor(userId: string, artist: string) {
  const server = await getNavidrome(userId);
  if (!server) return null;
  try {
    return await findNavidromeArtist(server, artist);
  } catch {
    return null;
  }
}

export function guessTrackId(artistId: string, title: string) {
  return `${artistId}-${titleKey(title)}`;
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
  if (song.coverArt) {
    await sql`
      UPDATE tracks
      SET navidrome_cover = coalesce(navidrome_cover, ${song.coverArt}),
          navidrome_user = CASE WHEN navidrome_cover IS NULL THEN ${userId} ELSE navidrome_user END
      WHERE id = ${trackId}`;
  }
  if (song.album) await linkAlbums([{ trackId, album: song.album, number: song.track }]);
  return trackId;
}
