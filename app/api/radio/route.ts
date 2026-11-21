import { NextResponse } from "next/server";
import { isSongId } from "@/lib/navidrome";
import { radioSongs } from "@/lib/radio";
import { sessionOrTokenUser } from "@/lib/token-auth";

const MOST_EXCLUDED = 500;
const ID = /^[^\s/]{1,300}$/;
const MOST_TEXT = 300;

function id(value: unknown) {
  return typeof value === "string" && ID.test(value) ? value : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() && value.length <= MOST_TEXT ? value : undefined;
}

export async function POST(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return NextResponse.json({ error: "Log in to start a radio" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const trackId = id(body?.trackId);
  const artistId = id(body?.artistId);
  const seed = trackId ? { trackId } : artistId ? { artistId } : null;
  if (!seed) return NextResponse.json({ error: "Choose a song or an artist" }, { status: 400 });
  const exclude = (Array.isArray(body?.exclude) ? body.exclude : [])
    .filter((value: unknown): value is string => typeof value === "string" && isSongId(value))
    .slice(-MOST_EXCLUDED);
  const skipTracks = (Array.isArray(body?.skipTracks) ? body.skipTracks : [])
    .filter((value: unknown): value is string => id(value) !== null)
    .slice(-MOST_EXCLUDED);
  const songs = await radioSongs(userId, seed, exclude, {
    artist: text(body?.artist),
    title: text(body?.title),
    continuing: body?.continuing === true,
    skipTracks,
  });
  if (songs === null) return NextResponse.json({ error: "Connect Navidrome to start a radio" }, { status: 409 });
  return NextResponse.json({ songs });
}
