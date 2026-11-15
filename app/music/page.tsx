import Link from "next/link";
import MusicList from "@/components/music-list";
import { type MusicSong, toMusicSongs } from "@/lib/music";
import { libraryOrder, songOrder, sortChoices, sortSongs } from "@/lib/music-sort";
import {
  getLibraries,
  getLibraryAlbums,
  getLibrarySongs,
  getNavidrome,
  getPlaylistSongs,
  getPlaylists,
  getSongsOfAlbums,
  NavidromeError,
  type NavidromeLibrary,
  type NavidromePlaylist,
} from "@/lib/navidrome";
import { requireUserId } from "@/lib/session";

export const metadata = { title: "Music" };

const PAGE_SIZE = 100;
const ALBUMS_PER_PAGE = 20;

type Props = {
  searchParams: Promise<{
    library?: string;
    playlist?: string;
    q?: string;
    page?: string;
    sort?: string;
    play?: string;
  }>;
};

type Shown = {
  title: string;
  songs: MusicSong[];
  page: number;
  hasMore: boolean;
  libraryId?: string;
  playlistId?: string;
  query?: string;
  sort: string;
  firstNumber: number;
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
    if (params.playlist) {
      const playlist = await getPlaylistSongs(server, params.playlist);
      if (playlist) {
        const order = songOrder(params.sort);
        shown = {
          title: playlist.name,
          songs: await toMusicSongs(sortSongs(playlist.songs, order)),
          page: 1,
          hasMore: false,
          playlistId: params.playlist,
          sort: order ?? "",
          firstNumber: 1,
        };
      }
    } else {
      const library = libraries.find((item) => item.id === params.library) ?? libraries[0];
      const query = params.q?.trim().slice(0, 100) || undefined;
      if (query) {
        const order = songOrder(params.sort);
        const found = await getLibrarySongs(server, {
          libraryId: library?.id,
          query,
          offset: (page - 1) * PAGE_SIZE,
          size: PAGE_SIZE + 1,
        });
        shown = {
          title: library?.name ?? "Library",
          songs: await toMusicSongs(sortSongs(found.slice(0, PAGE_SIZE), order)),
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
          songs: await toMusicSongs(await getSongsOfAlbums(server, albums.slice(0, ALBUMS_PER_PAGE))),
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
                    >
                      {library.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
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
              {shown.playlistId ? (
                <p className="muted">
                  {shown.songs.length} songs · {hours(shown.songs.reduce((sum, song) => sum + (song.duration ?? 0), 0))}
                </p>
              ) : (
                <form action="/music" className="music-search" role="search">
                  {shown.libraryId && <input type="hidden" name="library" value={shown.libraryId} />}
                  <input
                    type="search"
                    name="q"
                    defaultValue={shown.query}
                    placeholder={`Search ${shown.title}`}
                    aria-label={`Search ${shown.title}`}
                  />
                </form>
              )}
              <nav className="music-sort" aria-label="Sort by">
                <span className="muted">Sort by</span>
                {sortChoices(shown.playlistId ? "playlist" : shown.query ? "search" : "library").map((choice) => {
                  const value = !shown.playlistId && !shown.query && choice.value === "artist" ? "" : choice.value;
                  return (
                    <Link
                      key={choice.value}
                      href={address({
                        library: shown.playlistId ? undefined : shown.libraryId,
                        playlist: shown.playlistId,
                        q: shown.query,
                        sort: value,
                      })}
                      aria-current={shown.sort === value ? "true" : undefined}
                    >
                      {choice.label}
                    </Link>
                  );
                })}
              </nav>
              <MusicList
                songs={shown.songs}
                firstNumber={shown.firstNumber}
                autoplay={params.play === "1" && Boolean(shown.playlistId)}
              />
              {(shown.page > 1 || shown.hasMore) && (
                <nav className="pager" aria-label="Pages">
                  {shown.page > 1 ? (
                    <Link
                      href={address({
                        library: shown.libraryId,
                        q: shown.query,
                        sort: shown.sort,
                        page: shown.page - 1,
                      })}
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
                        q: shown.query,
                        sort: shown.sort,
                        page: shown.page + 1,
                      })}
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
            !problem && <p className="muted">That playlist is gone from Navidrome.</p>
          )}
        </section>
      </div>
    </>
  );
}
