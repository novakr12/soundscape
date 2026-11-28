import { NextResponse } from "next/server";
import { checkFullSong, findFullSong } from "@/lib/navidrome";
import { redirectTo } from "@/lib/relative-redirect";
import { routeParam } from "@/lib/route-param";
import { sessionOrTokenUser } from "@/lib/token-auth";
import { findKnownAlbum, knownTrackInfo, libraryAlbum, resolveTrackCover } from "@/lib/track-album";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ trackId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return NextResponse.json({ error: "Log in to listen" }, { status: 401 });
  const trackId = routeParam((await params).trackId);
  const noStore = { "cache-control": "private, no-store" };
  if (new URL(request.url).searchParams.has("info")) {
    const [found, known] = await Promise.all([checkFullSong(userId, trackId), knownTrackInfo(trackId)]);
    const { songId: _, album, albumId, coverArt, ...check } = found;
    const resolvedAlbum =
      known.album ??
      (album && found.lookedFor ? await findKnownAlbum(found.lookedFor.artist, album) : null) ??
      libraryAlbum({ album, albumId });
    const cover = resolveTrackCover({
      cover: known.cover,
      navidromeCover: known.navidromeCover,
      coverArt,
    });
    return NextResponse.json({ ...check, ...(resolvedAlbum ?? {}), ...(cover ? { cover } : {}) }, { headers: noStore });
  }
  const songId = await findFullSong(userId, trackId);
  const target = songId
    ? `/api/full-song/${encodeURIComponent(songId)}`
    : `/api/preview/${encodeURIComponent(trackId)}`;
  return redirectTo(target, noStore);
}
