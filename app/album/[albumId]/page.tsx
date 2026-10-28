import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Cover from "@/components/cover";
import PlayButton from "@/components/play-button";
import { getAlbum } from "@/lib/albums";
import { currentUserId } from "@/lib/session";
import { ensureTracklist } from "@/lib/tracklists";

type Props = { params: Promise<{ albumId: string }> };

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const album = await getAlbum(decodeURIComponent((await params).albumId), null);
  return { title: album ? `${album.title} · ${album.artist} · Soundscape` : "Soundscape" };
}

export default async function AlbumPage({ params }: Props) {
  const albumId = decodeURIComponent((await params).albumId);
  const [viewer] = await Promise.all([currentUserId(), ensureTracklist(albumId)]);
  const album = await getAlbum(albumId, viewer);
  if (!album) notFound();
  const discs = new Set(album.tracks.map((track) => track.disc ?? 1)).size;
  const numbered = album.tracks.some((track) => track.number);
  const position = (track: (typeof album.tracks)[number], index: number) =>
    track.number
      ? discs > 1
        ? `${track.disc ?? 1}.${track.number}`
        : String(track.number)
      : numbered
        ? ""
        : String(index + 1);

  const tiles = [
    { label: "Plays", value: album.plays },
    { label: "Listeners", value: album.listeners },
    { label: "Songs played", value: album.played },
    ...(viewer ? [{ label: "Your plays", value: album.yourPlays }] : []),
  ];

  return (
    <>
      <div className="song-header">
        <Cover src={album.cover} large />
        <div>
          <p className="muted">Album</p>
          <h1>{album.title}</h1>
          <p>
            <Link href={`/artist/${encodeURIComponent(album.artistId)}`}>{album.artist}</Link>
          </p>
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
        <h2>Songs</h2>
        <ol className={viewer ? "chart playable" : "chart"}>
          {album.tracks.map((track, index) =>
            track.trackId ? (
              <li key={track.trackId}>
                <span className="muted">{position(track, index)}</span>
                <span>
                  <Link href={`/track/${encodeURIComponent(track.trackId)}`}>{track.title}</Link>
                  <small className="muted stats">
                    {track.plays === 0 ? "Not played yet" : plural(track.plays, "play")}
                    {viewer && track.yourPlays > 0 && ` · ${plural(track.yourPlays, "play")} by you`}
                  </small>
                </span>
                {viewer && (
                  <PlayButton
                    track={{ trackId: track.trackId, title: track.title, artist: album.artist, cover: track.cover }}
                  />
                )}
              </li>
            ) : (
              <li key={`${track.disc}-${track.number}-${track.title}`} className="unplayed">
                <span className="muted">{position(track, index)}</span>
                <span className="muted">
                  {track.title}
                  <small className="stats">Not played yet</small>
                </span>
              </li>
            ),
          )}
        </ol>
      </section>
    </>
  );
}
