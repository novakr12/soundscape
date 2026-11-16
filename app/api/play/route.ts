import { after, NextResponse } from "next/server";
import { scrobbleToLastfm } from "@/lib/lastfm-scrobble";
import { saveNavidromeSong } from "@/lib/music";
import { isSongId } from "@/lib/navidrome";
import { recordPlay } from "@/lib/plays";
import { relayPlay } from "@/lib/relay";
import { sessionOrTokenUser } from "@/lib/token-auth";

export async function POST(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) {
    return NextResponse.json({ error: "Log in to play tracks" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const trackId = body?.trackId;

  if (typeof trackId !== "string" || !trackId) {
    return NextResponse.json({ error: "trackId is required" }, { status: 400 });
  }

  const songId = typeof body?.songId === "string" && isSongId(body.songId) ? body.songId : null;
  let play = await recordPlay(userId, trackId);
  if (!play && songId) {
    const saved = await saveNavidromeSong(userId, songId);
    if (saved) play = await recordPlay(userId, saved);
  }
  if (!play) {
    return NextResponse.json({ error: `Unknown track: ${trackId}` }, { status: 404 });
  }

  after(() =>
    scrobbleToLastfm(userId, [{ artist: play.artist, title: play.title, playedAt: new Date(play.playedAt) }]),
  );
  after(() => relayPlay(userId, play));
  return NextResponse.json(play, { status: 201 });
}
