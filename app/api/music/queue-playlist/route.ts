import { NextResponse } from "next/server";
import { findAllInLibrary, getNavidrome, NavidromeError } from "@/lib/navidrome";
import { createPlaylistWithSongs } from "@/lib/navidrome-library";
import { missingLibrarySongs, readQueuePlaylistRequest, resolveQueueSongIds } from "@/lib/queue-playlist";
import { sessionOrTokenUser } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

const NOT_CONNECTED = "Connect Navidrome on the Connect page to use playlists";

export async function POST(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return NextResponse.json({ error: "Log in to save playlists" }, { status: 401 });
  const parsed = readQueuePlaylistRequest(await request.json().catch(() => null));
  if (!parsed) {
    return NextResponse.json({ error: "Give the playlist a name and at least one song" }, { status: 400 });
  }
  const server = await getNavidrome(userId);
  if (!server) return NextResponse.json({ error: NOT_CONNECTED }, { status: 409 });
  try {
    const missingSongs = missingLibrarySongs(parsed.tracks);
    const found = missingSongs.length > 0 ? await findAllInLibrary(server, missingSongs) : new Map<string, string>();
    const { songIds, missing } = resolveQueueSongIds(parsed.tracks, found);
    if (songIds.length === 0) {
      return NextResponse.json({ error: "None of these songs are in your Navidrome" }, { status: 404 });
    }
    await createPlaylistWithSongs(server, parsed.name, songIds);
    return NextResponse.json({
      name: parsed.name,
      saved: songIds.length,
      total: parsed.tracks.length,
      missing,
    });
  } catch (error) {
    if (!(error instanceof NavidromeError)) throw error;
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
