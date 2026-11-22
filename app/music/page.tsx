import Form from "next/form";
import Link from "next/link";
import MusicList from "@/components/music-list";
import { artistSearchQueries } from "@/lib/artist-catalog";
import { type MusicSong, toMusicSongs } from "@/lib/music";
import { libraryOrder, songOrder, sortChoices, sortSongs } from "@/lib/music-sort";
import { getNavidrome, NavidromeError } from "@/lib/navidrome";
import {
  findNavidromeArtist,
  getLibraries,
  getLibraryAlbums,
  getLibrarySongs,
  getNavidromeAlbum,
  getNavidromeArtist,
  getPlaylistSongs,
  getPlaylists,
  getSongsOfAlbums,
  type NavidromeLibrary,
  type NavidromePlaylist,
} from "@/lib/navidrome-library";
import { requireUserId } from "@/lib/session";
import { unplayedAlbums } from "@/lib/unplayed";

export const metadata = { title: "Music" };

const PAGE_SIZE = 100;
const COLLECTION_PAGE_SIZE = 200;
const ALBUMS_PER_PAGE = 20;
const UNPLAYED_PER_PAGE = 5;

type Props = {
  searchParams: Promise<{
    library?: string;
    playlist?: string;
    album?: string;
    artist?: string;
    q?: string;
    page?: string;
    sort?: string;
    play?: string;
    unplayed?: string;
  }>;
};

type Shown = {
  title: string;
  songs: MusicSong[];
  page: number;
  hasMore: boolean;
  libraryId?: string;
  playlistId?: string;
  albumId?: string;
  artistId?: string;
  subtitle?: string;
  query?: string;
  unplayed?: number;
  sort: string;
  firstNumber: number;
  totalSongs?: number;
  totalDuration?: number;
};

function address(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && !(key === "page" && value === 1)) query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `/music?${text}` : "/music";
}

function hours(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

export default async function MusicPage({ searchParams }: Props) {
  const userId = await requireUserId();
  const server = await getNavidrome(userId);
  if (!server) {
    return (
      <>
        <h1>Music</h1>
        <p>
          Connect your Navidrome server on the <Link href="/connect#navidrome-library">Connect page</Link> to browse
          your libraries and playlists here.
        </p>
      </>
    );
  }

  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  let libraries: NavidromeLibrary[] = [];
  let playlists: NavidromePlaylist[] = [];
  let shown: Shown | null = null;
  let problem: string | null = null;

  try {
    [libraries, playlists] = await Promise.all([getLibraries(server), getPlaylists(server)]);
    if (params.album) {
      const album = await getNavidromeAlbum(server, params.album);
      if (album) {
        const order = songOrder(params.sort);
        shown = {
          title: album.name,
          subtitle: album.artist,
          songs: await toMusicSongs(sortSongs(album.songs, order)),
          page: 1,
          hasMore: false,
          albumId: params.album,
          sort: order ?? "",
          firstNumber: 1,
        };
      }
    } else if (params.artist) {
      const artist = await getNavidromeArtist(server, params.artist);
      if (artist) {
        const order = songOrder(params.sort);
        let raw = await getSongsOfAlbums(server, artist.albums);
        if (raw.length === 0) {
          const found = await findNavidromeArtist(server, artist.name).catch(() => null);
          if (found) raw = found.songs;
        }
        const all = order ? sortSongs(raw, order) : raw;
        const from = (page - 1) * COLLECTION_PAGE_SIZE;
        shown = {
          title: artist.name,
          songs: await toMusicSongs(all.slice(from, from + COLLECTION_PAGE_SIZE), { library: params.library }),
          page,
          hasMore: all.length > from + COLLECTION_PAGE_SIZE,
          libraryId: libraries.some((item) => item.id === params.library) ? params.library : undefined,
          artistId: params.artist,
          sort: order ?? "",
          firstNumber: from + 1,
          totalSongs: all.length,
          totalDuration: all.reduce((sum, song) => sum + (song.duration ?? 0), 0),
        };
      }
    } else if (params.unplayed) {
      const albums = await unplayedAlbums(userId, server, new Date().toISOString().slice(0, 10));
      const from = (page - 1) * UNPLAYED_PER_PAGE;
      shown = {
        title: "Never played",
        songs: await toMusicSongs(await getSongsOfAlbums(server, albums.slice(from, from + UNPLAYED_PER_PAGE))),
        page,
        hasMore: albums.length > from + UNPLAYED_PER_PAGE,
        unplayed: albums.length,
        sort: "",
        firstNumber: 1,
      };
    } else if (params.playlist) {
      const playlist = await getPlaylistSongs(server, params.playlist);
      if (playlist) {
        const order = songOrder(params.sort);
        const all = sortSongs(playlist.songs, order);
        const from = (page - 1) * COLLECTION_PAGE_SIZE;
        shown = {
          title: playlist.name,
          songs: await toMusicSongs(all.slice(from, from + COLLECTION_PAGE_SIZE)),
          page,
          hasMore: all.length > from + COLLECTION_PAGE_SIZE,
          playlistId: params.playlist,
          sort: order ?? "",
          firstNumber: from + 1,
          totalSongs: all.length,
          totalDuration: all.reduce((sum, song) => sum + (song.duration ?? 0), 0),
        };
      }
    } else {
      const library = libraries.find((item) => item.id === params.library) ?? libraries[0];
      const query = params.q?.trim().slice(0, 100) || undefined;
      if (query) {
        const order = songOrder(params.sort);
        let found = await getLibrarySongs(server, {
          libraryId: library?.id,
          query,
          offset: (page - 1) * PAGE_SIZE,
          size: PAGE_SIZE + 1,
        });
        if (found.length === 0 && page === 1) {
          for (const fallback of artistSearchQueries(query).slice(1)) {
            found = await getLibrarySongs(server, {
              libraryId: library?.id,
              query: fallback,
              offset: 0,
              size: PAGE_SIZE + 1,
            });
            if (found.length > 0) break;
          }
        }
        shown = {
          title: library?.name ?? "Library",
          songs: await toMusicSongs(sortSongs(found.slice(0, PAGE_SIZE), order), { library: library?.id }),
          page,
          hasMore: found.length > PAGE_SIZE,
          libraryId: library?.id,
          query,
          sort: order ?? "",
          firstNumber: (page - 1) * PAGE_SIZE + 1,
        };
      } else {
        const order = libraryOrder(params.sort);
        const albums = await getLibraryAlbums(server, {
          libraryId: library?.id,
          order,
          offset: (page - 1) * ALBUMS_PER_PAGE,
          size: ALBUMS_PER_PAGE + 1,
        });
        shown = {
          title: library?.name ?? "Library",
          songs: await toMusicSongs(await getSongsOfAlbums(server, albums.slice(0, ALBUMS_PER_PAGE)), {
            library: library?.id,
          }),
          page,
          hasMore: albums.length > ALBUMS_PER_PAGE,
          libraryId: library?.id,
          sort: order === "artist" ? "" : order,
          firstNumber: 1,
        };
      }
    }
  } catch (error) {
    if (!(error instanceof NavidromeError)) throw error;
    problem = error.message;
  }

  return (
    <>
      <h1>Music</h1>
      {problem && <p className="error">{problem}</p>}
      <div className="music">
        <nav className="music-sources" aria-label="Libraries and playlists">
          {libraries.length > 0 && (
            <>
              <h2>Libraries</h2>
              <ul>
                {libraries.map((library) => (
                  <li key={library.id}>
                    <Link
                      href={address({ library: library.id })}
                      aria-current={shown?.libraryId === library.id ? "page" : undefined}
                      prefetch={false}
                    >
                      {library.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h2>Discover</h2>
          <ul>
            <li>
              <Link
                href={address({ unplayed: 1 })}
                aria-current={shown?.unplayed !== undefined ? "page" : undefined}
                prefetch={false}
              >
                Never played
              </Link>
            </li>
          </ul>
          <h2>Playlists</h2>
          {playlists.length === 0 ? (
            <p className="muted">No playlists in Navidrome yet.</p>
          ) : (
            <ul>
              {playlists.map((playlist) => (
                <li key={playlist.id}>
                  <Link
                    href={address({ playlist: playlist.id })}
                    aria-current={shown?.playlistId === playlist.id ? "page" : undefined}
                    prefetch={false}
                  >
                    {playlist.name}
                    <span className="muted"> · {playlist.songCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <section className="music-shown">
          {shown ? (
            <>
              <h2>{shown.title}</h2>
              {shown.unplayed !== undefined ? (
                <p className="muted">
                  {shown.unplayed === 0
                    ? "You've played something from every album in your Navidrome."
                    : `${shown.unplayed.toLocaleString("en")} ${shown.unplayed === 1 ? "album" : "albums"} in your Navidrome you haven't played a song from yet, in a new order every day.`}
                </p>
              ) : shown.albumId || shown.artistId ? (
                <p className="muted">
                  {shown.subtitle ? `${shown.subtitle} · ` : ""}
                  {shown.totalSongs ?? shown.songs.length} songs ·{" "}
                  {hours(shown.totalDuration ?? shown.songs.reduce((sum, song) => sum + (song.duration ?? 0), 0))}
                </p>
              ) : shown.playlistId ? (
                <p className="muted">
                  {shown.totalSongs ?? shown.songs.length} songs ·{" "}
                  {hours(shown.totalDuration ?? shown.songs.reduce((sum, song) => sum + (song.duration ?? 0), 0))}
                </p>
              ) : (
                <Form action="/music" className="music-search" role="search">
                  {shown.libraryId && <input type="hidden" name="library" value={shown.libraryId} />}
                  <input
                    type="search"
                    name="q"
                    defaultValue={shown.query}
                    placeholder={`Search ${shown.title}`}
                    aria-label={`Search ${shown.title}`}
                  />
                </Form>
              )}
              {shown.unplayed === undefined && (
                <nav className="music-sort" aria-label="Sort by">
                  <span className="muted">Sort by</span>
                  {sortChoices(
                    shown.albumId || shown.artistId
                      ? "album"
                      : shown.playlistId
                        ? "playlist"
                        : shown.query
                          ? "search"
                          : "library",
                  ).map((choice) => {
                    const library = !shown.playlistId && !shown.albumId && !shown.artistId && !shown.query;
                    const value = library && choice.value === "artist" ? "" : choice.value;
                    return (
                      <Link
                        key={choice.value}
                        href={address({
                          library: shown.playlistId || shown.albumId ? undefined : shown.libraryId,
                          playlist: shown.playlistId,
                          album: shown.albumId,
                          artist: shown.artistId,
                          q: shown.query,
                          sort: value,
                        })}
                        aria-current={shown.sort === value ? "true" : undefined}
                        prefetch={false}
                      >
                        {choice.label}
                      </Link>
                    );
                  })}
                </nav>
              )}
              {shown.unplayed !== 0 && (
                <MusicList
                  songs={shown.songs}
                  firstNumber={shown.firstNumber}
                  autoplay={params.play === "1" && Boolean(shown.playlistId)}
                  download={shown.albumId || shown.playlistId ? shown.title : undefined}
                  shuffleAll={
                    shown.libraryId !== undefined && !shown.artistId && (shown.page > 1 || shown.hasMore)
                      ? { library: shown.libraryId, ...(shown.query ? { q: shown.query } : {}) }
                      : undefined
                  }
                  fullList={
                    (shown.playlistId || shown.artistId) && (shown.page > 1 || shown.hasMore)
                      ? {
                          ...(shown.playlistId ? { playlist: shown.playlistId } : {}),
                          ...(shown.artistId ? { artist: shown.artistId } : {}),
                          ...(shown.libraryId ? { library: shown.libraryId } : {}),
                          ...(shown.sort ? { sort: shown.sort } : {}),
                        }
                      : undefined
                  }
                />
              )}
              {(shown.page > 1 || shown.hasMore) && (
                <nav className="pager" aria-label="Pages">
                  {shown.page > 1 ? (
                    <Link
                      href={address({
                        library: shown.libraryId,
                        playlist: shown.playlistId,
                        artist: shown.artistId,
                        q: shown.query,
                        sort: shown.sort,
                        unplayed: shown.unplayed === undefined ? undefined : 1,
                        page: shown.page - 1,
                      })}
                      prefetch={false}
                    >
                      ← Previous
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="muted">Page {shown.page}</span>
                  {shown.hasMore ? (
                    <Link
                      href={address({
                        library: shown.libraryId,
                        playlist: shown.playlistId,
                        artist: shown.artistId,
                        q: shown.query,
                        sort: shown.sort,
                        unplayed: shown.unplayed === undefined ? undefined : 1,
                        page: shown.page + 1,
                      })}
                      prefetch={false}
                    >
                      Next →
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </>
          ) : (
            !problem && (
              <p className="muted">
                That {params.album ? "album" : params.artist ? "artist" : "playlist"} is gone from Navidrome.
              </p>
            )
          )}
        </section>
      </div>
    </>
  );
}
