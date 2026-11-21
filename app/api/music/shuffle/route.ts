import { NextResponse } from "next/server";
import { toMusicSongs } from "@/lib/music";
import { getNavidrome, NavidromeError } from "@/lib/navidrome";
import { getLibrarySongs, getRandomSongs } from "@/lib/navidrome-library";
import { currentUserId } from "@/lib/session";
import { shuffled } from "@/lib/shuffle";

export const dynamic = "force-dynamic";

const RANDOM_SONGS = 200;
const MOST_FOUND = 500;

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Log in to shuffle your music" }, { status: 401 });
  const server = await getNavidrome(userId);
  if (!server) return NextResponse.json({ error: "Connect Navidrome to shuffle your music" }, { status: 409 });
  const params = new URL(request.url).searchParams;
  const libraryId = params.get("library") ?? undefined;
  const query = params.get("q")?.trim().slice(0, 100);
  try {
    const songs = query
      ? shuffled(await getLibrarySongs(server, { libraryId, query, offset: 0, size: MOST_FOUND }))
      : await getRandomSongs(server, { size: RANDOM_SONGS, libraryId });
    return NextResponse.json({ songs: await toMusicSongs(songs) });
  } catch (error) {
    if (!(error instanceof NavidromeError)) throw error;
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
