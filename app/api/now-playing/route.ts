import { after, NextResponse } from "next/server";
import { resolveTrackId } from "@/lib/aliases";
import { sendNowPlayingToLastfm } from "@/lib/lastfm-scrobble";
import { getListening, publishListening, setListening, type TrackRef } from "@/lib/live";
import { getNavidrome, isSongId } from "@/lib/navidrome";
import { getSong } from "@/lib/navidrome-library";
import { sql } from "@/lib/postgres";
import { relayNowPlaying } from "@/lib/relay";
import { currentUserId } from "@/lib/session";

async function knownTrack(trackId: string) {
  const [row] = await sql`
    SELECT t.title, a.name AS artist, t.cover, t.duration_ms
    FROM tracks t JOIN artists a ON a.id = t.artist_id
    WHERE t.id = ${trackId}`;
  if (!row) return null;
  const track: TrackRef = { trackId, title: row.title, artist: row.artist, ...(row.cover ? { cover: row.cover } : {}) };
  return { track, durationMs: (row.duration_ms as number | null) ?? undefined };
}

async function navidromeTrack(userId: string, songId: string) {
  const server = await getNavidrome(userId);
  const song = server ? await getSong(server, songId) : null;
  if (!song) return null;
  const track: TrackRef = {
    trackId: await resolveTrackId(song.artist, song.title),
    title: song.title,
    artist: song.artist,
  };
  return { track, durationMs: song.duration ? song.duration * 1000 : undefined };
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Log in to share what you play" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const trackId = typeof body?.trackId === "string" ? body.trackId : "";
  const songId = typeof body?.songId === "string" && isSongId(body.songId) ? body.songId : null;
  if (!trackId) return NextResponse.json({ error: "trackId is required" }, { status: 400 });

  const found = (await knownTrack(trackId)) ?? (songId ? await navidromeTrack(userId, songId) : null);
  if (!found) return NextResponse.json({ error: `Unknown track: ${trackId}` }, { status: 404 });
  if ((await getListening(userId))?.source === "jellyfin") return NextResponse.json({ status: "ok" });

  const { track, durationMs } = found;
  await setListening(userId, track, durationMs);
  await publishListening(userId);
  after(() => sendNowPlayingToLastfm(userId, { artist: track.artist, title: track.title, durationMs }));
  after(() => relayNowPlaying(userId, track));
  return NextResponse.json({ status: "ok" });
}
