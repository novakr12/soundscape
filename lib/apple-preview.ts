import { mainArtist, mainTitle, normalize } from "./deezer";
import { request } from "./http";
import { sql } from "./postgres";

const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const RESULTS = 25;

const itunesApi = () => process.env.ITUNES_API_URL ?? "https://itunes.apple.com";
const country = () => (process.env.APPLE_MUSIC_COUNTRY || "us").trim().toLowerCase().slice(0, 2);

const globalForApple = globalThis as unknown as {
  soundscapeAppleFilling?: boolean;
};

export class AppleUnreachable extends Error {}

export type AppleCoverMatch = {
  cover: string;
  album?: string;
  durationMs?: number;
  preview?: string;
};

export type AppleCoverSummary = { checked: number; found: number; unreachable: boolean };

type SearchResult = {
  kind?: string;
  wrapperType?: string;
  artistName?: string;
  trackName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  trackTimeMillis?: number;
};

function playable(result: SearchResult) {
  return result.kind === "song" && typeof result.previewUrl === "string" && result.previewUrl.startsWith("https://");
}

export function highResArtwork(url: string | undefined): string | null {
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  return url.replace(/\/\d+x\d+bb\./, "/600x600bb.");
}

function pickTrackMatch<T extends SearchResult>(results: T[], artist: string, title: string): T | null {
  const wantedTitle = normalize(title);
  const wantedMainTitle = normalize(mainTitle(title));
  for (const wantedArtist of [...new Set([normalize(artist), normalize(mainArtist(artist))])]) {
    const byArtist = results.filter((song) => normalize(song.artistName ?? "") === wantedArtist);
    const match =
      byArtist.find((song) => normalize(song.trackName ?? "") === wantedTitle) ??
      byArtist.find((song) => normalize(song.trackName ?? "").startsWith(`${wantedTitle} `)) ??
      byArtist.find((song) => normalize(mainTitle(song.trackName ?? "")) === wantedMainTitle);
    if (match) return match;
  }
  return null;
}

export function pickPreview(results: SearchResult[], artist: string, title: string): string | null {
  return pickTrackMatch(results.filter(playable), artist, title)?.previewUrl ?? null;
}

function isSongResult(result: SearchResult) {
  return result.kind === "song" || result.wrapperType === "track";
}

export function pickAppleCover(
  results: SearchResult[],
  artist: string,
  title: string,
  album?: string | null,
): AppleCoverMatch | null {
  const songs = results.filter(
    (result) => isSongResult(result) && highResArtwork(result.artworkUrl100 ?? result.artworkUrl60),
  );
  const trackMatch = pickTrackMatch(songs, artist, title);
  if (trackMatch) {
    const cover = highResArtwork(trackMatch.artworkUrl100 ?? trackMatch.artworkUrl60);
    if (cover) {
      return {
        cover,
        ...(trackMatch.collectionName?.trim() ? { album: trackMatch.collectionName.trim() } : {}),
        ...(typeof trackMatch.trackTimeMillis === "number" && trackMatch.trackTimeMillis > 0
          ? { durationMs: trackMatch.trackTimeMillis }
          : {}),
        ...(playable(trackMatch) ? { preview: trackMatch.previewUrl } : {}),
      };
    }
  }
  const wantedAlbum = album?.trim();
  if (!wantedAlbum) return null;
  const normalizedAlbum = normalize(wantedAlbum);
  const normalizedMainAlbum = normalize(mainTitle(wantedAlbum));
  const albums = results.filter(
    (result) => result.wrapperType === "collection" && highResArtwork(result.artworkUrl100 ?? result.artworkUrl60),
  );
  for (const wantedArtist of [...new Set([normalize(artist), normalize(mainArtist(artist))])]) {
    const byArtist = albums.filter((item) => normalize(item.artistName ?? "") === wantedArtist);
    const albumMatch =
      byArtist.find((item) => normalize(item.collectionName ?? "") === normalizedAlbum) ??
      byArtist.find((item) => normalize(mainTitle(item.collectionName ?? "")) === normalizedMainAlbum);
    if (albumMatch) {
      const cover = highResArtwork(albumMatch.artworkUrl100 ?? albumMatch.artworkUrl60);
      if (cover) {
        return {
          cover,
          ...(albumMatch.collectionName?.trim() ? { album: albumMatch.collectionName.trim() } : {}),
        };
      }
    }
  }
  return null;
}

async function searchItunes(term: string, entity: "song" | "album"): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    term,
    media: "music",
    entity,
    limit: String(RESULTS),
    country: country(),
  });
  let response: Response;
  try {
    response = await request(`${itunesApi()}/search?${params}`, { timeoutMs: 5000 });
  } catch {
    throw new AppleUnreachable("Apple Music is unreachable");
  }
  if (!response.ok) throw new AppleUnreachable(`Apple Music answered with ${response.status}`);
  const body = (await response.json().catch(() => ({}))) as { results?: SearchResult[] };
  return body.results ?? [];
}

export async function findAppleCover(
  artist: string,
  title: string,
  album?: string | null,
): Promise<AppleCoverMatch | null> {
  const songs = await searchItunes(`${mainArtist(artist)} ${mainTitle(title)}`, "song");
  const songMatch = pickAppleCover(songs, artist, title, album);
  if (songMatch) return songMatch;
  if (!album?.trim()) return null;
  const albums = await searchItunes(`${mainArtist(artist)} ${mainTitle(album)}`, "album");
  return pickAppleCover(albums, artist, title, album);
}

export async function applePreviewFor(trackId: string, now = Date.now()): Promise<string | null> {
  const [row] = await sql`
    SELECT t.title, a.name AS artist, t.apple_preview, t.apple_checked_at
    FROM tracks t JOIN artists a ON a.id = t.artist_id
    WHERE t.id = ${trackId}`;
  if (!row) return null;
  if (row.apple_checked_at && now - row.apple_checked_at.getTime() < RECHECK_MS) return row.apple_preview ?? null;
  const results = await searchItunes(`${mainArtist(row.artist)} ${mainTitle(row.title)}`, "song");
  const preview = pickPreview(results, row.artist, row.title);
  const appleCover = pickAppleCover(results, row.artist, row.title);
  await sql`
    UPDATE tracks
    SET apple_preview = ${preview},
        cover = coalesce(cover, ${appleCover?.cover ?? null}::text),
        duration_ms = coalesce(duration_ms, ${appleCover?.durationMs ?? null}::int),
        apple_checked_at = ${new Date(now)}
    WHERE id = ${trackId}`;
  return preview;
}

export async function fillCoversFromApple(
  options: { userId?: string; limit?: number; now?: number } = {},
): Promise<AppleCoverSummary> {
  const { userId, limit = 25, now = Date.now() } = options;
  const summary: AppleCoverSummary = { checked: 0, found: 0, unreachable: false };
  if (globalForApple.soundscapeAppleFilling) return summary;
  globalForApple.soundscapeAppleFilling = true;
  try {
    const listened = userId
      ? sql`AND EXISTS (SELECT 1 FROM user_track_plays p WHERE p.track_id = t.id AND p.user_id = ${userId})`
      : sql``;
    const rows = await sql`
      SELECT t.id, t.title, a.name AS artist, al.title AS album
      FROM tracks t
      JOIN artists a ON a.id = t.artist_id
      LEFT JOIN albums al ON al.id = t.album_id
      WHERE t.cover IS NULL AND t.deezer_missing
        AND (t.apple_checked_at IS NULL OR t.apple_checked_at < ${new Date(now - RECHECK_MS)}) ${listened}
      ORDER BY t.id
      LIMIT ${limit}`;

    for (const row of rows) {
      const trackId: string = row.id;
      let match: AppleCoverMatch | null;
      try {
        match = await findAppleCover(row.artist, row.title, row.album);
      } catch (error) {
        if (!(error instanceof AppleUnreachable)) throw error;
        summary.unreachable = true;
        break;
      }
      summary.checked++;
      if (match) {
        await sql`
          UPDATE tracks
          SET cover = ${match.cover},
              apple_preview = coalesce(apple_preview, ${match.preview ?? null}::text),
              duration_ms = coalesce(duration_ms, ${match.durationMs ?? null}::int),
              apple_checked_at = ${new Date(now)}
          WHERE id = ${trackId}`;
        summary.found++;
      } else {
        await sql`UPDATE tracks SET apple_checked_at = ${new Date(now)} WHERE id = ${trackId}`;
      }
    }
    return summary;
  } finally {
    globalForApple.soundscapeAppleFilling = false;
  }
}
