import Link from "next/link";
import { artistIdFor } from "@/lib/catalog";

export function SongLink({ trackId, children }: { trackId: string; children: React.ReactNode }) {
  return (
    <Link className="music-link" href={`/track/${encodeURIComponent(trackId)}`}>
      {children}
    </Link>
  );
}

export function ArtistLink({ name }: { name: string }) {
  return (
    <Link className="music-link" href={`/artist/${encodeURIComponent(artistIdFor(name))}`}>
      {name}
    </Link>
  );
}
