import { mainArtist, mainTitle, normalize } from "./deezer";
import { sql } from "./postgres";

const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const RESULTS = 25;

const itunesApi = () => process.env.ITUNES_API_URL ?? "https://itunes.apple.com";
const country = () => (process.env.APPLE_MUSIC_COUNTRY || "us").trim().toLowerCase().slice(0, 2);

export class AppleUnreachable extends Error {}

type SearchResult = {
  kind?: string;
  artistName?: string;
  trackName?: string;
  previewUrl?: string;
};

function playable(result: SearchResult) {
  return result.kind === "song" && typeof result.previewUrl === "string" && result.previewUrl.startsWith("https://");
}

export function pickPreview(results: SearchResult[], artist: string, title: string): string | null {
  const songs = results.filter(playable);
  const wantedTitle = normalize(title);
  const wantedMainTitle = normalize(mainTitle(title));
  for (const wantedArtist of [...new Set([normalize(artist), normalize(mainArtist(artist))])]) {
    const byArtist = songs.filter((song) => normalize(song.artistName ?? "") === wantedArtist);
    const match =
      byArtist.find((song) => normalize(song.trackName ?? "") === wantedTitle) ??
      byArtist.find((song) => normalize(song.trackName ?? "").startsWith(`${wantedTitle} `)) ??
      byArtist.find((song) => normalize(mainTitle(song.trackName ?? "")) === wantedMainTitle);
    if (match?.previewUrl) return match.previewUrl;
  }
  return null;
}

export async function findApplePreview(artist: string, title: string): Promise<string | null> {
  const params = new URLSearchParams({
    term: `${mainArtist(artist)} ${mainTitle(title)}`,
    media: "music",
    entity: "song",
    limit: String(RESULTS),
    country: country(),
  });
  let response: Response;
  try {
    response = await fetch(`${itunesApi()}/search?${params}`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
  } catch {
    throw new AppleUnreachable("Apple Music is unreachable");
  }
  if (!response.ok) throw new AppleUnreachable(`Apple Music answered with ${response.status}`);
  const body = (await response.json().catch(() => ({}))) as { results?: SearchResult[] };
  return pickPreview(body.results ?? [], artist, title);
}

export async function applePreviewFor(trackId: string, now = Date.now()): Promise<string | null> {
  const [row] = await sql`
    SELECT t.title, a.name AS artist, t.apple_preview, t.apple_checked_at
    FROM tracks t JOIN artists a ON a.id = t.artist_id
    WHERE t.id = ${trackId}`;
  if (!row) return null;
  if (row.apple_checked_at && now - row.apple_checked_at.getTime() < RECHECK_MS) return row.apple_preview ?? null;
  const preview = await findApplePreview(row.artist, row.title);
  await sql`UPDATE tracks SET apple_preview = ${preview}, apple_checked_at = ${new Date(now)} WHERE id = ${trackId}`;
  return preview;
}
