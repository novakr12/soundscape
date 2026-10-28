import type { Metadata } from "next";
import Link from "next/link";
import Cover from "@/components/cover";
import { ArtistLink, SongLink } from "@/components/music-links";
import { MIN_QUERY_LENGTH, searchAlbums, searchArtists, searchSongs, searchUsers } from "@/lib/search";
import { currentUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Search · Soundscape" };

type Props = { searchParams: Promise<{ q?: string }> };

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

export default async function SearchPage({ searchParams }: Props) {
  const query = String((await searchParams).q ?? "")
    .trim()
    .slice(0, 100);
  const ready = query.length >= MIN_QUERY_LENGTH;
  const viewer = await currentUserId();
  const [songs, artists, albums, users] = ready
    ? await Promise.all([searchSongs(query), searchArtists(query), searchAlbums(query), searchUsers(query, viewer)])
    : [[], [], [], []];
  const nothing = songs.length + artists.length + albums.length + users.length === 0;

  return (
    <>
      <h1>Search</h1>
      <form action="/search" role="search" className="search search-page">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Songs, artists, albums or users"
          aria-label="Search songs, artists, albums and users"
          autoFocus={!query}
        />
        <button type="submit">Search</button>
      </form>

      {!ready ? (
        <p className="muted">Type at least {MIN_QUERY_LENGTH} characters.</p>
      ) : nothing ? (
        <p className="muted">Nothing found for &ldquo;{query}&rdquo;.</p>
      ) : (
        <>
          {songs.length > 0 && (
            <section>
              <h2>Songs</h2>
              <ul className="listening-list">
                {songs.map((song) => (
                  <li key={song.trackId}>
                    <Cover src={song.cover} />
                    <span className="listening-info">
                      <span>
                        <SongLink trackId={song.trackId}>{song.title}</SongLink>{" "}
                        <span className="muted">
                          · <ArtistLink name={song.artist} />
                        </span>
                      </span>
                      <small className="muted">{plural(song.plays, "play")}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {artists.length > 0 && (
            <section>
              <h2>Artists</h2>
              <ul className="listening-list">
                {artists.map((artist) => (
                  <li key={artist.artistId}>
                    <Cover src={artist.cover} round={artist.photo} />
                    <span className="listening-info">
                      <ArtistLink name={artist.name} />
                      <small className="muted">
                        {plural(artist.listeners, "listener")} · {plural(artist.plays, "play")}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {albums.length > 0 && (
            <section>
              <h2>Albums</h2>
              <ul className="listening-list">
                {albums.map((album) => (
                  <li key={album.albumId}>
                    <Cover src={album.cover} />
                    <span className="listening-info">
                      <span>
                        <Link className="music-link" href={`/album/${encodeURIComponent(album.albumId)}`}>
                          {album.title}
                        </Link>{" "}
                        <span className="muted">
                          · <ArtistLink name={album.artist} />
                        </span>
                      </span>
                      <small className="muted">{plural(album.plays, "play")}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {users.length > 0 && (
            <section>
              <h2>Users</h2>
              <ul>
                {users.map((username) => (
                  <li key={username}>
                    <Link href={`/u/${encodeURIComponent(username)}`}>{username}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
