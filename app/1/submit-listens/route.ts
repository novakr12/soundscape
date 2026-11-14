import { after, NextResponse } from "next/server";
import { trackNumber } from "@/lib/albums";
import { resolveTrackId, resolveTracks } from "@/lib/aliases";
import { songArtist, songTitle } from "@/lib/catalog";
import { findMissingCovers } from "@/lib/covers";
import { findTrackDetails } from "@/lib/deezer";
import { importListens, type Listen } from "@/lib/imports";
import { scrobbleToLastfm, sendNowPlayingToLastfm } from "@/lib/lastfm-scrobble";
import { addListeningDetails, getListening, publishListening, publishPlay, setListening } from "@/lib/live";
import { relaySubmission } from "@/lib/relay";
import { userForAuthorization } from "@/lib/tokens";

const MAX_LISTENS_PER_REQUEST = 1000;
const LIVE_WINDOW_MS = 10 * 60 * 1000;

type SubmittedListen = {
  listened_at?: number;
  track_metadata?: {
    artist_name?: string;
    track_name?: string;
    release_name?: string;
    additional_info?: {
      duration_ms?: number;
      duration?: number;
      recording_mbid?: string;
      tracknumber?: string | number;
    };
  };
};

function durationMsOf(info?: { duration_ms?: number; duration?: number }) {
  return Number(info?.duration_ms) || Number(info?.duration) * 1000 || undefined;
}

function error(code: number, message: string) {
  return NextResponse.json({ code, error: message }, { status: code });
}

export async function POST(request: Request) {
  const userId = await userForAuthorization(request.headers.get("authorization"), request.headers.get("user-agent"));
  if (!userId) return error(401, "Invalid authorization token.");

  const body = await request.json().catch(() => null);
  const listenType: unknown = body?.listen_type;
  const payload: SubmittedListen[] | undefined = Array.isArray(body?.payload) ? body.payload : undefined;
  if (listenType !== "single" && listenType !== "playing_now" && listenType !== "import") {
    return error(400, "listen_type must be single, playing_now or import.");
  }
  if (!payload || payload.length === 0) return error(400, "payload must contain at least one listen.");
  if (payload.some((listen) => typeof listen !== "object" || listen === null)) {
    return error(400, "Every listen in payload must be an object.");
  }
  if (listenType !== "import" && payload.length !== 1) return error(400, `${listenType} takes exactly one listen.`);
  if (payload.length > MAX_LISTENS_PER_REQUEST)
    return error(400, `At most ${MAX_LISTENS_PER_REQUEST} listens per request.`);

  if (listenType === "playing_now") {
    const metadata = payload[0].track_metadata ?? {};
    const artist = String(metadata.artist_name ?? "").trim();
    const title = String(metadata.track_name ?? "").trim();
    if (!artist || !title) return error(400, "artist_name and track_name are required.");
    const info = metadata.additional_info ?? {};
    const durationMs = durationMsOf(info);
    const album = typeof metadata.release_name === "string" ? metadata.release_name : undefined;
    after(() => sendNowPlayingToLastfm(userId, { artist, title, album, durationMs }));
    const trackId = await resolveTrackId(artist, title);
    if ((await getListening(userId))?.source === "jellyfin") {
      after(() => relaySubmission(userId, body));
      return NextResponse.json({ status: "ok" });
    }
    await setListening(userId, { trackId, title, artist }, durationMs);
    await publishListening(userId);
    after(async () => {
      const details = await findTrackDetails(trackId, artist, title).catch(() => null);
      if (!details) return;
      if (await addListeningDetails(userId, trackId, details)) await publishListening(userId);
    });
    after(() => relaySubmission(userId, body));
    return NextResponse.json({ status: "ok" });
  }

  const listens: Listen[] = payload.map((listen) => ({
    artist: String(listen.track_metadata?.artist_name ?? "").trim(),
    title: String(listen.track_metadata?.track_name ?? "").trim(),
    playedAt: listen.listened_at ? new Date(listen.listened_at * 1000) : new Date(),
    mbid: listen.track_metadata?.additional_info?.recording_mbid,
    durationMs: durationMsOf(listen.track_metadata?.additional_info),
    album: typeof listen.track_metadata?.release_name === "string" ? listen.track_metadata.release_name : undefined,
    trackNumber: trackNumber(listen.track_metadata?.additional_info?.tracknumber),
  }));
  const result = await importListens(userId, listens);
  if (result.imported === 0) return error(400, "No valid listens in payload.");
  after(() => findMissingCovers(userId, result.catalogNodesCreated > 0));
  after(() => relaySubmission(userId, body));
  if (listenType === "single") after(() => scrobbleToLastfm(userId, listens));

  const recent = listens.filter((l) => l.artist && l.title && Date.now() - l.playedAt.getTime() < LIVE_WINDOW_MS);
  const recentIds = await resolveTracks(recent);
  for (const [i, listen] of recent.entries()) {
    await publishPlay({
      userId,
      trackId: recentIds[i].trackId,
      title: songTitle(listen.title),
      artist: songArtist(listen.artist),
      playedAt: listen.playedAt.toISOString(),
    });
  }

  return NextResponse.json({ status: "ok" });
}
