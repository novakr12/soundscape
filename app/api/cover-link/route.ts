import { resolveTrackId } from "@/lib/aliases";
import { publicCover } from "@/lib/covers";
import { findLibrarySong, getNavidrome } from "@/lib/navidrome";
import { sql } from "@/lib/postgres";
import { publicOrigin } from "@/lib/public-origin";
import { tokenUser, unauthorized } from "@/lib/token-auth";
import { knownAlbum, libraryAlbum } from "@/lib/track-album";

export const dynamic = "force-dynamic";

const LONGEST = 300;

async function albumFromNavidrome(userId: string, trackId: string, artist: string, title: string) {
  try {
    const server = await getNavidrome(userId);
    if (!server) return null;
    return libraryAlbum(await findLibrarySong(server, { trackId, title, artist }))?.album ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const userId = await tokenUser(request);
  if (!userId) return unauthorized();
  const params = new URL(request.url).searchParams;
  const artist = params.get("artist")?.trim().slice(0, LONGEST);
  const title = params.get("title")?.trim().slice(0, LONGEST);
  if (!artist || !title) return Response.json({ url: null, album: null });
  const trackId = await resolveTrackId(artist, title);
  const [[row], known] = await Promise.all([
    sql`SELECT cover, navidrome_cover FROM tracks WHERE id = ${trackId}`,
    knownAlbum(trackId),
  ]);
  const origin = new URL(publicOrigin(request)).origin;
  const album = known?.album ?? (await albumFromNavidrome(userId, trackId, artist, title));
  return Response.json(
    {
      url: publicCover(trackId, row as { cover: string | null; navidrome_cover: string | null } | undefined, origin),
      album,
    },
    { headers: { "cache-control": "private, max-age=3600" } },
  );
}
