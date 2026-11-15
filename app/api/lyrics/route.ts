import { NextResponse } from "next/server";
import { findLyrics } from "@/lib/lyrics";
import { currentUserId } from "@/lib/session";

const LONGEST = 300;

function text(value: string | null) {
  const trimmed = value?.trim().slice(0, LONGEST);
  return trimmed ? trimmed : undefined;
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Log in to see lyrics" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const trackId = text(params.get("trackId"));
  if (!trackId) return NextResponse.json({ error: "trackId is required" }, { status: 400 });
  const lyrics = await findLyrics(userId, {
    trackId,
    songId: text(params.get("songId")),
    artist: text(params.get("artist")),
    title: text(params.get("title")),
    album: text(params.get("album")),
  });
  return NextResponse.json({ lyrics }, { headers: { "cache-control": "private, max-age=3600" } });
}
