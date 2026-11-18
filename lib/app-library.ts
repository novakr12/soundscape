import { type BridgeTrack, bridgeTracks } from "./app-bridge";
import { navidromeCover, toMusicSongs } from "./music";
import { getNavidrome, isSongId, type Navidrome } from "./navidrome";
import {
  type AlbumOrder,
  getAlbumCards,
  getLibrarySongs,
  getNavidromeAlbum,
  getPlaylistSongs,
  getPlaylists,
  getRandomSongs,
  type NavidromeSong,
} from "./navidrome-library";

export type LibraryFolder = {
  kind: "folder";
  node: string;
  title: string;
  subtitle: string | null;
  cover: string | null;
  playable: boolean;
};

export type LibrarySong = { kind: "song"; track: BridgeTrack };

export type LibraryPage = { connected: boolean; title: string; items: (LibraryFolder | LibrarySong)[] };

export type LibraryNode =
  | { kind: "root" }
  | { kind: "albums"; order: Extract<AlbumOrder, "added" | "played" | "album"> }
  | { kind: "album"; id: string }
  | { kind: "playlists" }
  | { kind: "playlist"; id: string }
  | { kind: "shuffle" };

export const MOST_ALBUMS = 100;
export const SHUFFLE_SIZE = 50;
export const SEARCH_SIZE = 30;
const LONGEST_QUERY = 200;

const ALBUM_TITLES = { added: "New albums", played: "Most played", album: "All albums" } as const;

export const ROOT: LibraryFolder[] = [
  folder("albums:added", "New albums", null, null, false),
  folder("albums:played", "Most played", null, null, false),
  folder("playlists", "Playlists", null, null, false),
  folder("shuffle", "Shuffle", "50 random songs from your library", null, true),
];

function folder(node: string, title: string, subtitle: string | null, cover: string | null, playable: boolean) {
  return { kind: "folder" as const, node, title, subtitle, cover, playable };
}

export function readNode(text: string | null): LibraryNode | null {
  if (!text || text === "root") return { kind: "root" };
  if (text === "playlists") return { kind: "playlists" };
  if (text === "shuffle") return { kind: "shuffle" };
  if (text === "albums:added" || text === "albums:played" || text === "albums:album") {
    return { kind: "albums", order: text.slice("albums:".length) as "added" | "played" | "album" };
  }
  const [kind, id, ...rest] = text.split(":");
  if (rest.length > 0 || !id || !isSongId(id)) return null;
  if (kind === "album") return { kind: "album", id };
  if (kind === "playlist") return { kind: "playlist", id };
  return null;
}

export function readQuery(text: string | null) {
  const query = text?.trim().slice(0, LONGEST_QUERY);
  return query ? query : null;
}

async function songsOf(songs: NavidromeSong[]): Promise<LibrarySong[]> {
  const music = await toMusicSongs(songs);
  return bridgeTracks(music, true).map((track) => ({ kind: "song", track }));
}

async function pageFor(server: Navidrome, node: LibraryNode): Promise<Omit<LibraryPage, "connected"> | null> {
  if (node.kind === "root") return { title: "Soundscape", items: ROOT };
  if (node.kind === "albums") {
    const albums = await getAlbumCards(server, node.order, MOST_ALBUMS);
    return {
      title: ALBUM_TITLES[node.order],
      items: albums.map((album) =>
        folder(`album:${album.id}`, album.name, album.artist, navidromeCover(album.coverArt) ?? null, true),
      ),
    };
  }
  if (node.kind === "playlists") {
    const playlists = await getPlaylists(server);
    return {
      title: "Playlists",
      items: playlists.map((playlist) =>
        folder(
          `playlist:${playlist.id}`,
          playlist.name,
          playlist.songCount === 1 ? "1 song" : `${playlist.songCount} songs`,
          null,
          true,
        ),
      ),
    };
  }
  if (node.kind === "album") {
    const album = await getNavidromeAlbum(server, node.id);
    return album ? { title: album.name, items: await songsOf(album.songs) } : null;
  }
  if (node.kind === "playlist") {
    const playlist = await getPlaylistSongs(server, node.id);
    return playlist ? { title: playlist.name, items: await songsOf(playlist.songs) } : null;
  }
  return { title: "Shuffle", items: await songsOf(await getRandomSongs(server, { size: SHUFFLE_SIZE })) };
}

export async function libraryPage(userId: string, node: LibraryNode): Promise<LibraryPage | null> {
  if (node.kind === "root")
    return { connected: (await getNavidrome(userId)) !== null, title: "Soundscape", items: ROOT };
  const server = await getNavidrome(userId);
  if (!server) return { connected: false, title: "Soundscape", items: [] };
  const page = await pageFor(server, node);
  return page ? { connected: true, ...page } : null;
}

export async function librarySearch(userId: string, query: string): Promise<LibraryPage> {
  const server = await getNavidrome(userId);
  if (!server) return { connected: false, title: query, items: [] };
  const songs = await getLibrarySongs(server, { query, offset: 0, size: SEARCH_SIZE });
  return { connected: true, title: query, items: await songsOf(songs) };
}
