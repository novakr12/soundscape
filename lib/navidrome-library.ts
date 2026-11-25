import { artistSearchQueries, matchesArtistRecord, matchesSongForArtist, sortNavidromeAlbums } from "./artist-catalog";
import { artistIdFor, mainArtist, slug } from "./catalog";
import { fromReplayGain, type Gain } from "./levelling";
import { call, isSongId, type Navidrome, NavidromeError } from "./navidrome";

export type NavidromeLibrary = { id: string; name: string };

export type NavidromePlaylist = { id: string; name: string; songCount: number; duration: number };

export type NavidromeSong = {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
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
  artistId?: unknown;
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
  const artistId = typeof raw.artistId === "string" && isSongId(raw.artistId) ? raw.artistId : undefined;
  return {
    id,
    title,
    artist: text(raw.artist) ?? "Unknown artist",
    ...(artistId ? { artistId } : {}),
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
    id: albumId,
    name: text(result.album.name) ?? "Untitled album",
    artist: text(result.album.artist),
    songs: songs(result.album.song).sort(byDiscAndTrack),
  };
}

export type NavidromeArtistAlbum = {
  id: string;
  name: string;
  artist?: string;
  coverArt?: string;
  songCount?: number;
  year?: number;
};

export type NavidromeArtistCatalog = {
  artistId?: string;
  name: string;
  coverArt?: string;
  albums: NavidromeArtistAlbum[];
  songs: NavidromeSong[];
  songsTruncated?: boolean;
};

export const MAX_ARTIST_ALBUMS = 60;

type RawArtistAlbum = {
  id?: unknown;
  name?: unknown;
  artist?: unknown;
  coverArt?: unknown;
  songCount?: unknown;
  year?: unknown;
};

function toArtistAlbum(raw: RawArtistAlbum): NavidromeArtistAlbum | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const name = text(raw.name);
  if (!id || !isSongId(id) || !name) return null;
  const artist = text(raw.artist);
  const coverArt = text(raw.coverArt);
  const songCount = count(raw.songCount);
  const year = typeof raw.year === "number" && Number.isFinite(raw.year) && raw.year > 0 ? raw.year : undefined;
  return {
    id,
    name,
    ...(artist ? { artist } : {}),
    ...(coverArt && isSongId(coverArt) ? { coverArt } : {}),
    ...(songCount !== undefined ? { songCount } : {}),
    ...(year !== undefined ? { year } : {}),
  };
}

export async function getNavidromeArtist(server: Navidrome, artistId: string) {
  if (!isSongId(artistId)) return null;
  const result = await call<{ artist?: { name?: unknown; album?: { id?: unknown }[] } }>(server, "getArtist", [
    ["id", artistId],
  ]).catch(() => null);
  if (!result?.artist) return null;
  const albums = (result.artist.album ?? []).flatMap((album) =>
    typeof album.id === "string" && isSongId(album.id) ? [album.id] : [],
  );
  return { name: text(result.artist.name) ?? "Unknown artist", albums };
}

export async function findNavidromeArtist(
  server: Navidrome,
  name: string,
  options?: { maxAlbums?: number },
): Promise<NavidromeArtistCatalog | null> {
  const queries = artistSearchQueries(name);
  if (queries.length === 0) return null;
  const maxAlbums = Math.max(0, options?.maxAlbums ?? MAX_ARTIST_ALBUMS);

  const matchedArtists = new Map<string, { id: string; name: string; coverArt?: string }>();
  const searchAlbums = new Map<string, NavidromeArtistAlbum>();
  const searchSongs = new Map<string, NavidromeSong>();

  for (const query of queries) {
    const result = await call<{
      searchResult3?: {
        artist?: { id?: unknown; name?: unknown; coverArt?: unknown }[];
        album?: RawArtistAlbum[];
        song?: RawSong[];
      };
    }>(server, "search3", [
      ["query", query],
      ["artistCount", "20"],
      ["albumCount", "20"],
      ["songCount", "100"],
    ]);

    for (const rawArtist of result.searchResult3?.artist ?? []) {
      const id = typeof rawArtist.id === "string" ? rawArtist.id : null;
      const artistName = text(rawArtist.name);
      if (!id || !isSongId(id) || !artistName || !matchesArtistRecord(name, artistName)) continue;
      const coverArt = text(rawArtist.coverArt);
      if (!matchedArtists.has(id)) {
        matchedArtists.set(id, {
          id,
          name: artistName,
          ...(coverArt && isSongId(coverArt) ? { coverArt } : {}),
        });
      }
    }

    for (const rawAlbum of result.searchResult3?.album ?? []) {
      const album = toArtistAlbum(rawAlbum);
      if (album?.artist && matchesArtistRecord(name, album.artist) && !searchAlbums.has(album.id)) {
        searchAlbums.set(album.id, album);
      }
    }

    for (const song of songs(result.searchResult3?.song)) {
      if (matchesSongForArtist(name, song.artist, song.title) && !searchSongs.has(song.id)) {
        searchSongs.set(song.id, song);
      }
    }

    if (matchedArtists.size > 0) break;
  }

  const albumMap = new Map<string, NavidromeArtistAlbum>();
  const matchedArtistList = [...matchedArtists.values()].slice(0, 5);
  let primaryArtist = matchedArtistList[0];

  if (matchedArtistList.length > 0) {
    const responses = await Promise.all(
      matchedArtistList.map((matchedArtist) =>
        call<{ artist?: { name?: unknown; coverArt?: unknown; album?: RawArtistAlbum[] } }>(server, "getArtist", [
          ["id", matchedArtist.id],
        ]).catch(() => null),
      ),
    );
    for (let i = 0; i < responses.length; i++) {
      const artistRecord = responses[i]?.artist;
      if (!artistRecord) continue;
      if (i === 0 && primaryArtist) {
        const artistName = text(artistRecord.name);
        const coverArt = text(artistRecord.coverArt);
        primaryArtist = {
          id: primaryArtist.id,
          name: artistName ?? primaryArtist.name,
          coverArt: primaryArtist.coverArt ?? (coverArt && isSongId(coverArt) ? coverArt : undefined),
        };
      }
      for (const rawAlbum of artistRecord.album ?? []) {
        const album = toArtistAlbum(rawAlbum);
        if (album && !albumMap.has(album.id)) albumMap.set(album.id, album);
      }
    }
  }

  for (const album of searchAlbums.values()) {
    if (!albumMap.has(album.id)) albumMap.set(album.id, album);
  }

  const primaryAlbums = sortNavidromeAlbums([...albumMap.values()]);
  const albumsToFetch = primaryAlbums.slice(0, maxAlbums);
  const songsTruncated = primaryAlbums.length > maxAlbums;

  const albumSongLists: NavidromeSong[][] = new Array(albumsToFetch.length).fill([]);
  let next = 0;
  async function worker() {
    while (next < albumsToFetch.length) {
      const at = next++;
      const targetAlbum = albumsToFetch[at];
      const fetched = await getNavidromeAlbum(server, targetAlbum.id).catch(() => null);
      if (!fetched) continue;
      albumSongLists[at] = fetched.songs.map((song) => ({
        ...song,
        album: song.album ?? (fetched.name !== "Untitled album" ? fetched.name : targetAlbum.name),
        albumId: song.albumId ?? targetAlbum.id,
      }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, albumsToFetch.length) }, worker));

  const songMap = new Map<string, NavidromeSong>();
  for (const list of albumSongLists) {
    for (const song of list) {
      if (!songMap.has(song.id)) songMap.set(song.id, song);
    }
  }

  for (const song of searchSongs.values()) {
    if (!songMap.has(song.id)) {
      songMap.set(song.id, song);
      if (song.albumId && song.album && !albumMap.has(song.albumId)) {
        albumMap.set(song.albumId, {
          id: song.albumId,
          name: song.album,
          artist: song.artist,
          ...(song.coverArt ? { coverArt: song.coverArt } : {}),
        });
      }
    }
  }

  const albums = sortNavidromeAlbums([...albumMap.values()]);
  const allSongs = [...songMap.values()];
  if (albums.length === 0 && allSongs.length === 0) return null;

  return {
    ...(primaryArtist?.id ? { artistId: primaryArtist.id } : {}),
    name: primaryArtist?.name ?? name,
    ...(primaryArtist?.coverArt ? { coverArt: primaryArtist.coverArt } : {}),
    albums,
    songs: allSongs,
    ...(songsTruncated ? { songsTruncated: true } : {}),
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
  const primaryId = artistIdFor(mainArtist(artist));
  const match =
    candidates.find((album) => artistIdFor(album.artist) === artistId) ??
    candidates.find((album) => primaryId && artistIdFor(mainArtist(album.artist)) === primaryId) ??
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

const PLAYLIST_BATCH = 50;

export async function createPlaylistWithSongs(server: Navidrome, name: string, songIds: string[]) {
  if (songIds.length === 0) return null;
  const created = await call<{ playlist?: { id?: unknown } }>(server, "createPlaylist", [
    ["name", name],
    ...songIds.slice(0, PLAYLIST_BATCH).map((id): [string, string] => ["songId", id]),
  ]);
  let playlistId =
    typeof created.playlist?.id === "string" && isSongId(created.playlist.id) ? created.playlist.id : null;
  if (songIds.length > PLAYLIST_BATCH) {
    if (!playlistId) {
      const playlists = await getPlaylists(server);
      playlistId = playlists.filter((playlist) => playlist.name === name).at(-1)?.id ?? null;
    }
    if (!playlistId) throw new NavidromeError("Navidrome didn't return the new playlist.");
    for (let i = PLAYLIST_BATCH; i < songIds.length; i += PLAYLIST_BATCH) {
      await call(server, "updatePlaylist", [
        ["playlistId", playlistId],
        ...songIds.slice(i, i + PLAYLIST_BATCH).map((id): [string, string] => ["songIdToAdd", id]),
      ]);
    }
  }
  return playlistId;
}

export async function getRandomSongs(server: Navidrome, options: { size: number; genre?: string; libraryId?: string }) {
  const params: [string, string][] = [["size", String(options.size)]];
  if (options.genre) params.push(["genre", options.genre]);
  if (options.libraryId && isSongId(options.libraryId)) params.push(["musicFolderId", options.libraryId]);
  const result = await call<{ randomSongs?: { song?: RawSong[] } }>(server, "getRandomSongs", params);
  return songs(result.randomSongs?.song);
}
