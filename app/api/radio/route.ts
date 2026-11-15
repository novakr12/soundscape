import { NextResponse } from "next/server";
import { isSongId } from "@/lib/navidrome";
import { radioSongs } from "@/lib/radio";
import { currentUserId } from "@/lib/session";

const MOST_EXCLUDED = 500;
const ID = /^[^\s/]{1,300}$/;

function id(value: unknown) {
  return typeof value === "string" && ID.test(value) ? value : null;
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Log in to start a radio" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const trackId = id(body?.trackId);
  const artistId = id(body?.artistId);
  const seed = trackId ? { trackId } : artistId ? { artistId } : null;
  if (!seed) return NextResponse.json({ error: "Choose a song or an artist" }, { status: 400 });
  const exclude = (Array.isArray(body?.exclude) ? body.exclude : [])
    .filter((value: unknown): value is string => typeof value === "string" && isSongId(value))
    .slice(0, MOST_EXCLUDED);
  const songs = await radioSongs(userId, seed, exclude);
  if (songs === null) return NextResponse.json({ error: "Connect Navidrome to start a radio" }, { status: 409 });
  return NextResponse.json({ songs });
}
