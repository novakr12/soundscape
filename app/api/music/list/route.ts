import { NextResponse } from "next/server";
import { toMusicSongs } from "@/lib/music";
import { songOrder, sortSongs } from "@/lib/music-sort";
import { getNavidrome, NavidromeError } from "@/lib/navidrome";
import { findNavidromeArtist, getNavidromeArtist, getPlaylistSongs, getSongsOfAlbums } from "@/lib/navidrome-library";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Log in to view your music" }, { status: 401 });
  const server = await getNavidrome(userId);
  if (!server) return NextResponse.json({ error: "Connect Navidrome to view your music" }, { status: 409 });
  const params = new URL(request.url).searchParams;
  const playlistId = params.get("playlist");
  const artistId = params.get("artist");
  const library = params.get("library") ?? undefined;
  const order = songOrder(params.get("sort") ?? undefined);
  try {
    if (playlistId) {
      const playlist = await getPlaylistSongs(server, playlistId);
      if (!playlist) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
      return NextResponse.json({ songs: await toMusicSongs(sortSongs(playlist.songs, order)) });
    }
    if (artistId) {
      const artist = await getNavidromeArtist(server, artistId);
      if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
      let raw = await getSongsOfAlbums(server, artist.albums);
      if (raw.length === 0) {
        raw = (await findNavidromeArtist(server, artist.name).catch(() => null))?.songs ?? [];
      }
      return NextResponse.json({
        songs: await toMusicSongs(order ? sortSongs(raw, order) : raw, { library }),
      });
    }
    return NextResponse.json({ error: "Specify playlist or artist" }, { status: 400 });
  } catch (error) {
    if (!(error instanceof NavidromeError)) throw error;
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
