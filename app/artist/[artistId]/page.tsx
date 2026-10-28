import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Cover from "@/components/cover";
import PlayButton from "@/components/play-button";
import { albumsBy } from "@/lib/albums";
import { getArtist, getSimilarArtists, getTopSongs, getYourArtistPlays } from "@/lib/artists";
import { currentUserId } from "@/lib/session";

type Props = { params: Promise<{ artistId: string }> };

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const artist = await getArtist(decodeURIComponent((await params).artistId));
  return { title: artist ? `${artist.name} · Soundscape` : "Soundscape" };
}

export default async function ArtistPage({ params }: Props) {
  const artistId = decodeURIComponent((await params).artistId);
  const [artist, viewer] = await Promise.all([getArtist(artistId), currentUserId()]);
  if (!artist) notFound();

  const [songs, similar, yourPlays, albums] = await Promise.all([
    getTopSongs(artistId),
    getSimilarArtists(artistId),
    viewer ? getYourArtistPlays(viewer, artistId) : null,
    albumsBy(artistId),
  ]);

  const tiles = [
    { label: "Plays", value: artist.plays },
    { label: "Listeners", value: artist.listeners },
    { label: "Songs played", value: artist.songs },
    ...(yourPlays === null ? [] : [{ label: "Your plays", value: yourPlays }]),
  ];

  return (
    <>
      <div className="song-header">
        <Cover src={artist.photo ?? songs.find((song) => song.cover)?.cover} large round={Boolean(artist.photo)} />
        <div>
          <p className="muted">Artist</p>
          <h1>{artist.name}</h1>
          {artist.genres.length > 0 && <p className="muted">{artist.genres.join(" · ")}</p>}
        </div>
      </div>

      <div className="tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="tile">
            <span className="muted">{tile.label}</span>
            <strong>{tile.value.toLocaleString("en")}</strong>
          </div>
        ))}
      </div>

      <section>
        <h2>Top songs</h2>
        {songs.length === 0 ? (
          <p className="muted">Nobody has played this artist yet.</p>
        ) : (
          <ol className={viewer ? "chart playable" : "chart"}>
            {songs.map((song, index) => (
              <li key={song.trackId}>
                <span className="muted">{index + 1}</span>
                <span>
                  <Link href={`/track/${encodeURIComponent(song.trackId)}`}>{song.title}</Link>
                  <small className="muted stats">
                    {plural(song.plays, "play")} · {plural(song.listeners, "listener")}
                  </small>
                </span>
                {viewer && (
                  <PlayButton
                    track={{ trackId: song.trackId, title: song.title, artist: artist.name, cover: song.cover }}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {albums.length > 0 && (
        <section>
          <h2>Albums</h2>
          <ul className="listening-list">
            {albums.map((album) => (
              <li key={album.albumId}>
                <Cover src={album.cover} />
                <span className="listening-info">
                  <Link href={`/album/${encodeURIComponent(album.albumId)}`}>{album.title}</Link>
                  <small className="muted">
                    {plural(album.plays, "play")} · {plural(album.tracks, "song")} played
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Similar artists</h2>
        {similar.length === 0 ? (
          <p className="muted">Not enough listeners yet.</p>
        ) : (
          <ul className="listening-list">
            {similar.map((other) => (
              <li key={other.artistId}>
                <Cover src={other.cover} round={other.photo} />
                <span className="listening-info">
                  <Link href={`/artist/${encodeURIComponent(other.artistId)}`}>{other.name}</Link>
                  <small className="muted">{plural(other.listeners, "listener")} in common</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
