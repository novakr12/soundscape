import Link from "next/link";
import { artistIdFor } from "@/lib/catalog";

export function SongLink({
  trackId,
  songId,
  children,
}: {
  trackId: string;
  songId?: string;
  children: React.ReactNode;
}) {
  const href = `/track/${encodeURIComponent(trackId)}${songId ? `?song=${encodeURIComponent(songId)}` : ""}`;
  return (
    <Link className="music-link" href={href} prefetch={false}>
      {children}
    </Link>
  );
}

export function ArtistLink({ name }: { name: string }) {
  return (
    <Link className="music-link" href={`/artist/${encodeURIComponent(artistIdFor(name))}`} prefetch={false}>
      {name}
    </Link>
  );
}
