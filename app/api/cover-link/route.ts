import { resolveTrackId } from "@/lib/aliases";
import { findAppleCover } from "@/lib/apple-preview";
import { findCoverArt } from "@/lib/coverartarchive";
import { isPublicOrigin, publicCover } from "@/lib/covers";
import { findDeezerCover } from "@/lib/deezer";
import { getValue, keys, setValue } from "@/lib/kv";
import { findLibrarySong, getNavidrome, type SubsonicSong } from "@/lib/navidrome";
import { sql } from "@/lib/postgres";
import { publicOrigin } from "@/lib/public-origin";
import { tokenUser, unauthorized } from "@/lib/token-auth";
import { knownAlbum, libraryAlbum } from "@/lib/track-album";

export const dynamic = "force-dynamic";

const LONGEST = 300;
const FOUND_CACHE_SECONDS = 7 * 24 * 60 * 60;
const MISS_CACHE_SECONDS = 6 * 60 * 60;

async function songFromNavidrome(
  userId: string,
  trackId: string,
  artist: string,
  title: string,
): Promise<SubsonicSong | null> {
  try {
    const server = await getNavidrome(userId);
    if (!server) return null;
    return await findLibrarySong(server, { trackId, title, artist });
  } catch {
    return null;
  }
}

async function resolvePublicCover(
  trackId: string,
  artist: string,
  title: string,
  album: string | null,
  hasTrackRow: boolean,
): Promise<{ url: string | null; album: string | null }> {
  const cached = await getValue<{ url: string | null; album?: string | null }>(keys.coverLink(trackId));
  if (cached) {
    return {
      url: cached.url && isPublicOrigin(cached.url) ? cached.url : null,
      album: cached.album ?? null,
    };
  }

  let checked = false;
  let found: { url: string; album: string | null } | null = null;

  try {
    const match = await findDeezerCover(artist, title);
    checked = true;
    if (match && isPublicOrigin(match.cover)) {
      found = { url: match.cover, album: match.album ?? null };
    }
  } catch {}

  if (!found) {
    try {
      const match = await findAppleCover(artist, title, album);
      checked = true;
      if (match && isPublicOrigin(match.cover)) {
        found = { url: match.cover, album: match.album ?? null };
      }
    } catch {}
  }

  if (!found) {
    try {
      const match = await findCoverArt(artist, title, null, { fast: true });
      checked = true;
      if (match && isPublicOrigin(match.cover)) {
        found = { url: match.cover, album: null };
      }
    } catch {}
  }

  if (found) {
    await setValue(keys.coverLink(trackId), found, FOUND_CACHE_SECONDS);
    if (hasTrackRow) {
      await sql`
        UPDATE tracks SET cover = ${found.url}
        WHERE id = ${trackId} AND (cover IS NULL OR starts_with(cover, '/api/cover/'))`;
    }
    return found;
  }

  if (checked) {
    await setValue(keys.coverLink(trackId), { url: null, album: null }, MISS_CACHE_SECONDS);
  }
  return { url: null, album: null };
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
  const needsNavidrome = !known?.album || (isPublicOrigin(origin) && !row?.cover && !row?.navidrome_cover);
  const navSong = needsNavidrome ? await songFromNavidrome(userId, trackId, artist, title) : null;
  if (navSong?.coverArt && row && !row.navidrome_cover) {
    await sql`
      UPDATE tracks
      SET navidrome_cover = coalesce(navidrome_cover, ${navSong.coverArt}),
          navidrome_user = CASE WHEN navidrome_cover IS NULL THEN ${userId} ELSE navidrome_user END
      WHERE id = ${trackId}`;
  }
  const effectiveRow = row
    ? {
        cover: (row.cover as string | null) ?? null,
        navidrome_cover: (row.navidrome_cover as string | null) ?? navSong?.coverArt ?? null,
      }
    : undefined;
  let url = publicCover(trackId, effectiveRow, origin);
  let album = known?.album ?? libraryAlbum(navSong)?.album ?? null;
  if (url === null) {
    const resolved = await resolvePublicCover(trackId, artist, title, album, Boolean(row));
    if (resolved.url) url = resolved.url;
    if (!album && resolved.album) album = resolved.album;
  }
  return Response.json(
    { url, album },
    { headers: { "cache-control": url ? "private, max-age=3600" : "private, no-store" } },
  );
}
