import { NextResponse } from "next/server";
import { checkFullSong, getNavidrome, isSongId, NavidromeError } from "@/lib/navidrome";
import { addToPlaylist, createPlaylistWith, getPlaylists } from "@/lib/navidrome-library";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const LONGEST_NAME = 100;
const NOT_CONNECTED = "Connect Navidrome on the Connect page to use playlists";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Log in to see your playlists" }, { status: 401 });
  const server = await getNavidrome(userId);
  if (!server) return NextResponse.json({ error: NOT_CONNECTED }, { status: 409 });
  try {
    const playlists = await getPlaylists(server);
    return NextResponse.json({ playlists: playlists.map(({ id, name }) => ({ id, name })) });
  } catch (error) {
    if (!(error instanceof NavidromeError)) throw error;
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Log in to change playlists" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const trackId = typeof body?.trackId === "string" ? body.trackId : "";
  const playlistId = typeof body?.playlistId === "string" && isSongId(body.playlistId) ? body.playlistId : null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, LONGEST_NAME) : "";
  if (!trackId || (!playlistId && !name)) {
    return NextResponse.json({ error: "Choose a song and a playlist" }, { status: 400 });
  }
  const server = await getNavidrome(userId);
  if (!server) return NextResponse.json({ error: NOT_CONNECTED }, { status: 409 });
  const songId =
    typeof body?.songId === "string" && isSongId(body.songId)
      ? body.songId
      : ((await checkFullSong(userId, trackId)).songId ?? null);
  if (!songId) return NextResponse.json({ error: "This song isn't in your Navidrome" }, { status: 404 });
  try {
    if (playlistId) await addToPlaylist(server, playlistId, songId);
    else await createPlaylistWith(server, name, songId);
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    if (!(error instanceof NavidromeError)) throw error;
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
