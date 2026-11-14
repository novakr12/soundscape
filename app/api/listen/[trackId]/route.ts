import { NextResponse } from "next/server";
import { findFullSong } from "@/lib/navidrome";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ trackId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Log in to listen" }, { status: 401 });
  const { trackId } = await params;
  const songId = await findFullSong(userId, trackId);
  const noStore = { "cache-control": "private, no-store" };
  if (new URL(request.url).searchParams.has("info")) {
    return NextResponse.json({ full: songId !== null }, { headers: noStore });
  }
  const target = songId
    ? `/api/full-song/${encodeURIComponent(songId)}`
    : `/api/preview/${encodeURIComponent(trackId)}`;
  return NextResponse.redirect(new URL(target, request.url), { status: 307, headers: noStore });
}
