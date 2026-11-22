import { NextResponse } from "next/server";
import { checkFullSong, findFullSong } from "@/lib/navidrome";
import { redirectTo } from "@/lib/relative-redirect";
import { routeParam } from "@/lib/route-param";
import { sessionOrTokenUser } from "@/lib/token-auth";
import { findKnownAlbum, knownAlbum, libraryAlbum } from "@/lib/track-album";

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
    const [found, known] = await Promise.all([checkFullSong(userId, trackId), knownAlbum(trackId)]);
    const { songId: _, album, albumId, ...check } = found;
    const resolvedAlbum =
      known ??
      (album && found.lookedFor ? await findKnownAlbum(found.lookedFor.artist, album) : null) ??
      libraryAlbum({ album, albumId });
    return NextResponse.json({ ...check, ...(resolvedAlbum ?? {}) }, { headers: noStore });
  }
  const songId = await findFullSong(userId, trackId);
  const target = songId
    ? `/api/full-song/${encodeURIComponent(songId)}`
    : `/api/preview/${encodeURIComponent(trackId)}`;
  return redirectTo(target, noStore);
}
