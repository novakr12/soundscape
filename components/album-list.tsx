import Link from "next/link";
import Cover from "@/components/cover";
import { ArtistLink } from "@/components/music-links";
import type { TopAlbum } from "@/lib/albums";

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

export default function AlbumList({ albums }: { albums: TopAlbum[] }) {
  return (
    <ol className="ranked-list">
      {albums.map((album, index) => (
        <li key={album.albumId}>
          <span className="rank muted">{index + 1}</span>
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
    </ol>
  );
}
