import { artistIdFor, slug } from "./catalog";
import { fromReplayGain, type Gain } from "./levelling";
import { call, isSongId, type Navidrome } from "./navidrome";

export type NavidromeLibrary = { id: string; name: string };

export type NavidromePlaylist = { id: string; name: string; songCount: number; duration: number };

export type NavidromeSong = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumId?: string;
  duration?: number;
  coverArt?: string;
  track?: number;
  disc?: number;
  gain?: Gain;
  genre?: string;
};

type RawSong = {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
  album?: unknown;
  albumId?: unknown;
  duration?: unknown;
  coverArt?: unknown;
  track?: unknown;
  discNumber?: unknown;
  replayGain?: unknown;
  genre?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function toSong(raw: RawSong): NavidromeSong | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const title = text(raw.title);
  if (!id || !isSongId(id) || !title) return null;
  const coverArt = text(raw.coverArt);
  const albumId = typeof raw.albumId === "string" && isSongId(raw.albumId) ? raw.albumId : undefined;
  return {
    id,
    title,
    artist: text(raw.artist) ?? "Unknown artist",
    album: text(raw.album),
    albumId,
    duration: count(raw.duration),
    coverArt: coverArt && isSongId(coverArt) ? coverArt : undefined,
    track: count(raw.track),
    disc: count(raw.discNumber),
    gain: fromReplayGain(raw.replayGain),
    genre: text(raw.genre),
  };
}

function songs(list: RawSong[] | undefined) {
  return (list ?? []).flatMap((raw) => {
    const song = toSong(raw);
    return song ? [song] : [];
  });
}

export async function getLibraries(server: Navidrome): Promise<NavidromeLibrary[]> {
  const result = await call<{ musicFolders?: { musicFolder?: { id?: unknown; name?: unknown }[] } }>(
    server,
    "getMusicFolders",
  );
  return (result.musicFolders?.musicFolder ?? []).flatMap((folder) => {
    const id = typeof folder.id === "number" || typeof folder.id === "string" ? String(folder.id) : null;
    return id && isSongId(id) ? [{ id, name: text(folder.name) ?? `Library ${id}` }] : [];
  });
}

export async function getPlaylists(server: Navidrome): Promise<NavidromePlaylist[]> {
  const result = await call<{
    playlists?: { playlist?: { id?: unknown; name?: unknown; songCount?: unknown; duration?: unknown }[] };
  }>(server, "getPlaylists");
  return (result.playlists?.playlist ?? []).flatMap((playlist) => {
    const id = typeof playlist.id === "string" ? playlist.id : null;
    if (!id || !isSongId(id)) return [];
    return [
      {
        id,
        name: text(playlist.name) ?? "Untitled playlist",
        songCount: count(playlist.songCount) ?? 0,
        duration: count(playlist.duration) ?? 0,
      },
    ];
  });
}

export async function getPlaylistSongs(server: Navidrome, playlistId: string) {
  if (!isSongId(playlistId)) return null;
  const result = await call<{ playlist?: { name?: unknown; entry?: RawSong[] } }>(server, "getPlaylist", [
    ["id", playlistId],
  ]);
  if (!result.playlist) return null;
  return { name: text(result.playlist.name) ?? "Untitled playlist", songs: songs(result.playlist.entry) };
}

export async function getLibrarySongs(
  server: Navidrome,
  options: { libraryId?: string; query?: string; offset: number; size: number },
) {
  const params: [string, string][] = [
    ["query", options.query?.trim() || '""'],
    ["songCount", String(options.size)],
    ["songOffset", String(options.offset)],
    ["artistCount", "0"],
    ["albumCount", "0"],
  ];
  if (options.libraryId && isSongId(options.libraryId)) params.push(["musicFolderId", options.libraryId]);
  const result = await call<{ searchResult3?: { song?: RawSong[] } }>(server, "search3", params);
  return songs(result.searchResult3?.song);
}

export async function getSong(server: Navidrome, songId: string) {
  if (!isSongId(songId)) return null;
  try {
    const result = await call<{ song?: RawSong }>(server, "getSong", [["id", songId]]);
    return result.song ? toSong(result.song) : null;
  } catch {
    return null;
  }
}

export type AlbumOrder = "artist" | "album" | "added" | "year" | "played";

const ALBUM_LISTS: Record<AlbumOrder, [string, string][]> = {
  artist: [["type", "alphabeticalByArtist"]],
  album: [["type", "alphabeticalByName"]],
  added: [["type", "newest"]],
  year: [
    ["type", "byYear"],
    ["fromYear", "9999"],
    ["toYear", "0"],
  ],
  played: [["type", "frequent"]],
};

export async function getLibraryAlbums(
  server: Navidrome,
  options: { libraryId?: string; order: AlbumOrder; offset: number; size: number },
) {
  const params: [string, string][] = [
    ...ALBUM_LISTS[options.order],
    ["size", String(options.size)],
    ["offset", String(options.offset)],
  ];
  if (options.libraryId && isSongId(options.libraryId)) params.push(["musicFolderId", options.libraryId]);
  const result = await call<{ albumList2?: { album?: { id?: unknown }[] } }>(server, "getAlbumList2", params);
  return (result.albumList2?.album ?? []).flatMap((album) =>
    typeof album.id === "string" && isSongId(album.id) ? [album.id] : [],
  );
}

export type AlbumSummary = { id: string; name: string; artist: string };

export type AlbumCard = AlbumSummary & { coverArt?: string };

export async function getAlbumCards(server: Navidrome, order: AlbumOrder, size: number): Promise<AlbumCard[]> {
  const result = await call<{
    albumList2?: { album?: { id?: unknown; name?: unknown; artist?: unknown; coverArt?: unknown }[] };
  }>(server, "getAlbumList2", [...ALBUM_LISTS[order], ["size", String(size)], ["offset", "0"]]);
  return (result.albumList2?.album ?? []).flatMap((album) => {
    const name = text(album.name);
    if (typeof album.id !== "string" || !isSongId(album.id) || !name) return [];
    const coverArt = text(album.coverArt);
    return [
      {
        id: album.id,
        name,
        artist: text(album.artist) ?? "Unknown artist",
        ...(coverArt && isSongId(coverArt) ? { coverArt } : {}),
      },
    ];
  });
}

export async function getAlbumSummaries(server: Navidrome, offset: number, size: number): Promise<AlbumSummary[]> {
  const result = await call<{ albumList2?: { album?: { id?: unknown; name?: unknown; artist?: unknown }[] } }>(
    server,
    "getAlbumList2",
    [...ALBUM_LISTS.album, ["size", String(size)], ["offset", String(offset)]],
  );
  return (result.albumList2?.album ?? []).flatMap((album) => {
    const name = text(album.name);
    return typeof album.id === "string" && isSongId(album.id) && name
      ? [{ id: album.id, name, artist: text(album.artist) ?? "Unknown artist" }]
      : [];
  });
}

function byDiscAndTrack(a: NavidromeSong, b: NavidromeSong) {
  return (a.disc ?? 1) - (b.disc ?? 1) || (a.track ?? 0) - (b.track ?? 0);
}

export async function getNavidromeAlbum(server: Navidrome, albumId: string) {
  if (!isSongId(albumId)) return null;
  const result = await call<{ album?: { name?: unknown; artist?: unknown; song?: RawSong[] } }>(server, "getAlbum", [
    ["id", albumId],
  ]);
  if (!result.album) return null;
  return {
    name: text(result.album.name) ?? "Untitled album",
    artist: text(result.album.artist),
    songs: songs(result.album.song).sort(byDiscAndTrack),
  };
}

async function getAlbumSongs(server: Navidrome, albumId: string) {
  return (await getNavidromeAlbum(server, albumId))?.songs ?? [];
}

export async function findNavidromeAlbum(server: Navidrome, artist: string, title: string) {
  const result = await call<{ searchResult3?: { album?: { id?: unknown; name?: unknown; artist?: unknown }[] } }>(
    server,
    "search3",
    [
      ["query", title],
      ["albumCount", "20"],
      ["artistCount", "0"],
      ["songCount", "0"],
    ],
  );
  const wanted = slug(title);
  const candidates = (result.searchResult3?.album ?? []).flatMap((album) =>
    typeof album.id === "string" && isSongId(album.id) && slug(text(album.name) ?? "") === wanted
      ? [{ id: album.id, artist: text(album.artist) ?? "" }]
      : [],
  );
  const artistId = artistIdFor(artist);
  const match =
    candidates.find((album) => artistIdFor(album.artist) === artistId) ??
    (candidates.length === 1 ? candidates[0] : undefined);
  return match ? getNavidromeAlbum(server, match.id) : null;
}

export async function getSongsOfAlbums(server: Navidrome, albumIds: string[], concurrency = 5) {
  const found: NavidromeSong[][] = new Array(albumIds.length);
  let next = 0;
  async function worker() {
    while (next < albumIds.length) {
      const at = next++;
      found[at] = await getAlbumSongs(server, albumIds[at]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, albumIds.length) }, worker));
  return found.flat();
}

export async function addToPlaylist(server: Navidrome, playlistId: string, songId: string) {
  await call(server, "updatePlaylist", [
    ["playlistId", playlistId],
    ["songIdToAdd", songId],
  ]);
}

export async function createPlaylistWith(server: Navidrome, name: string, songId: string) {
  await call(server, "createPlaylist", [
    ["name", name],
    ["songId", songId],
  ]);
}

export async function getRandomSongs(server: Navidrome, options: { size: number; genre?: string; libraryId?: string }) {
  const params: [string, string][] = [["size", String(options.size)]];
  if (options.genre) params.push(["genre", options.genre]);
  if (options.libraryId && isSongId(options.libraryId)) params.push(["musicFolderId", options.libraryId]);
  const result = await call<{ randomSongs?: { song?: RawSong[] } }>(server, "getRandomSongs", params);
  return songs(result.randomSongs?.song);
}
