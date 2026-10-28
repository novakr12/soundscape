import Link from "next/link";
import Cover from "@/components/cover";
import { SongLink } from "@/components/music-links";
import type { AlbumRef } from "@/lib/albums";

export default function TrackCell({
  trackId,
  title,
  cover,
  album,
}: {
  trackId: string;
  title: string;
  cover?: string;
  album?: AlbumRef;
}) {
  return (
    <span className="track-cell">
      <Cover src={cover} />
      <span className="listening-info">
        <SongLink trackId={trackId}>{title}</SongLink>
        {album && (
          <small className="muted">
            <Link className="music-link" href={`/album/${encodeURIComponent(album.albumId)}`}>
              {album.title}
            </Link>
          </small>
        )}
      </span>
    </span>
  );
}
