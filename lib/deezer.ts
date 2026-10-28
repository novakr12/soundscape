import { linkAlbums } from "./albums";
import { sql } from "./postgres";

const deezerApi = () => process.env.DEEZER_API_URL ?? "https://api.deezer.com";
const requestGapMs = () => Number(process.env.DEEZER_REQUEST_GAP_MS ?? 120);
const QUOTA_EXCEEDED = 4;

let nextRequestAt = 0;

async function waitForTurn() {
  const wait = Math.max(0, nextRequestAt - Date.now());
  nextRequestAt = Math.max(Date.now(), nextRequestAt) + requestGapMs();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

type DeezerSearchResult = {
  id: number;
  title: string;
  duration: number;
  artist: { name: string };
  album: { cover_medium: string; title?: string };
};

export type DeezerMatch = {
  deezerId: number;
  cover: string;
  durationMs: number;
  album?: string;
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mainArtist(artist: string) {
  return artist.split(/\s*(?:,|&|;|\/|\bx\b|\bfeat\.?|\bft\.?|\bfeaturing\b)\s*/i)[0];
}

function withoutFeatures(title: string) {
  return title.replace(/\s*[([]?\s*(?:feat\.?|ft\.?|featuring|prod\.?|produced by)\s.*$/i, "");
}

function mainTitle(title: string) {
  const clean = withoutFeatures(title);
  return clean.split(/\s+-\s+|\s*[([]/)[0].trim() || clean;
}

async function searchDeezer(query: string, retry = true): Promise<DeezerSearchResult[]> {
  await waitForTurn();
  const params = new URLSearchParams({ q: query, limit: "10" });
  const response = await fetch(`${deezerApi()}/search?${params}`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Deezer search failed with ${response.status}`);

  const body = (await response.json()) as {
    data?: DeezerSearchResult[];
    error?: { message: string; code?: number };
  };
  if (body.error?.code === QUOTA_EXCEEDED && retry) {
    await new Promise((resolve) => setTimeout(resolve, 40 * requestGapMs()));
    return searchDeezer(query, false);
  }
  if (body.error) throw new Error(`Deezer search failed: ${body.error.message}`);
  return body.data ?? [];
}

export async function findDeezerTrack(artist: string, title: string): Promise<DeezerMatch | null> {
  const cleanTitle = withoutFeatures(title);
  const wantedTitle = normalize(cleanTitle);
  const wantedMainTitle = normalize(mainTitle(title));
  const wantedArtists = [...new Set([normalize(artist), normalize(mainArtist(artist))])];
  const queries = [...new Set([`${artist} ${cleanTitle}`, `${mainArtist(artist)} ${mainTitle(title)}`])];

  for (const query of queries) {
    const results = await searchDeezer(query);
    for (const wantedArtist of wantedArtists) {
      const byArtist = results.filter((t) => normalize(t.artist.name) === wantedArtist);
      const match =
        byArtist.find((t) => normalize(t.title) === wantedTitle) ??
        byArtist.find((t) => normalize(t.title).startsWith(`${wantedTitle} `)) ??
        byArtist.find((t) => normalize(mainTitle(t.title)) === wantedMainTitle);
      if (match) {
        return {
          deezerId: match.id,
          cover: match.album.cover_medium,
          durationMs: match.duration * 1000,
          ...(match.album.title ? { album: match.album.title } : {}),
        };
      }
    }
  }
  return null;
}

async function deezerGet<T>(path: string, retry = true): Promise<T & { error?: { message: string; code?: number } }> {
  await waitForTurn();
  const response = await fetch(`${deezerApi()}${path}`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Deezer answered ${response.status}`);
  const body = (await response.json()) as T & { error?: { message: string; code?: number } };
  if (body.error?.code === QUOTA_EXCEEDED && retry) {
    await new Promise((resolve) => setTimeout(resolve, 40 * requestGapMs()));
    return deezerGet<T>(path, false);
  }
  if (body.error?.code === QUOTA_EXCEEDED) throw new Error(`Deezer: ${body.error.message}`);
  return body;
}

async function deezerAlbumOf(deezerId: number): Promise<string | null> {
  const body = await deezerGet<{ album?: { title?: string } }>(`/track/${deezerId}`);
  return body.album?.title || null;
}

export type ArtistPhoto = { deezerArtistId: number; photo: string | null };

type DeezerArtist = { id: number; name: string; picture_medium?: string; nb_fan?: number };

export async function findDeezerArtist(name: string): Promise<ArtistPhoto | null> {
  const query = new URLSearchParams({ q: name, limit: "25" });
  const { data = [] } = await deezerGet<{ data?: DeezerArtist[] }>(`/search/artist?${query}`);
  for (const wanted of [...new Set([normalize(name), normalize(mainArtist(name))])]) {
    const match = data
      .filter((artist) => normalize(artist.name) === wanted)
      .sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0];
    if (match) {
      const photo = match.picture_medium && !match.picture_medium.includes("/artist//") ? match.picture_medium : null;
      return { deezerArtistId: match.id, photo };
    }
  }
  return null;
}

export type AlbumTracklist = { deezerAlbumId: number; tracks: { title: string; number: number; disc: number }[] };

const MAX_ALBUM_TRACKS = 200;

export async function findDeezerAlbum(artist: string, album: string): Promise<AlbumTracklist | null> {
  const query = new URLSearchParams({ q: `${artist} ${album}`, limit: "25" });
  const { data = [] } = await deezerGet<{ data?: { id: number; title: string; artist: { name: string } }[] }>(
    `/search/album?${query}`,
  );
  const wantedArtists = new Set([normalize(artist), normalize(mainArtist(artist))]);
  const byArtist = data.filter((result) => wantedArtists.has(normalize(result.artist.name)));
  const match =
    byArtist.find((result) => normalize(result.title) === normalize(album)) ??
    byArtist.find((result) => normalize(mainTitle(result.title)) === normalize(mainTitle(album)));
  if (!match) return null;

  const { data: tracks = [] } = await deezerGet<{
    data?: { title: string; track_position: number; disk_number: number }[];
  }>(`/album/${match.id}/tracks?limit=${MAX_ALBUM_TRACKS}`);
  return {
    deezerAlbumId: match.id,
    tracks: tracks
      .map((track) => ({ title: track.title, number: track.track_position, disc: track.disk_number || 1 }))
      .sort((a, b) => a.disc - b.disc || a.number - b.number),
  };
}

export type AlbumSummary = { checked: number; linked: number; unreachable: boolean };

function listenedBy(userId?: string) {
  return userId
    ? sql`AND EXISTS (SELECT 1 FROM user_track_plays p WHERE p.track_id = t.id AND p.user_id = ${userId})`
    : sql``;
}

export async function fillAlbumsFromDeezer(limit = 100, userId?: string): Promise<AlbumSummary> {
  const rows = await sql`
    SELECT t.id, t.deezer_id FROM tracks t
    WHERE t.deezer_id IS NOT NULL AND NOT t.deezer_album_missing AND t.album_id IS NULL ${listenedBy(userId)}
    ORDER BY t.id
    LIMIT ${limit}`;
  const summary: AlbumSummary = { checked: 0, linked: 0, unreachable: false };
  for (const row of rows) {
    let album: string | null;
    try {
      album = await deezerAlbumOf(row.deezer_id);
    } catch {
      summary.unreachable = true;
      break;
    }
    summary.checked++;
    if (album && (await linkAlbums([{ trackId: row.id, album }], "deezer")) > 0) {
      summary.linked++;
    } else {
      await sql`UPDATE tracks SET deezer_album_missing = true WHERE id = ${row.id}`;
    }
  }
  return summary;
}

export async function getPreviewUrl(deezerId: number): Promise<string | null> {
  const response = await fetch(`${deezerApi()}/track/${deezerId}`, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Deezer track lookup failed with ${response.status}`);

  const body = (await response.json()) as { preview?: string; error?: { message: string } };
  if (body.error) throw new Error(`Deezer track lookup failed: ${body.error.message}`);

  return body.preview || null;
}

async function saveMatch(trackId: string, match: DeezerMatch) {
  await sql`
    UPDATE tracks SET deezer_id = ${match.deezerId}, cover = ${match.cover}, duration_ms = ${match.durationMs},
                      deezer_missing = false
    WHERE id = ${trackId}`;
  if (match.album) await linkAlbums([{ trackId, album: match.album }], "deezer");
}

export type MatchSummary = {
  checked: number;
  matched: number;
  missing: string[];
  unreachable: boolean;
};

export function needsDeezer() {
  return sql`(t.deezer_id IS NULL OR t.duration_ms IS NULL) AND NOT t.deezer_missing`;
}

export async function matchMissingTracks(limit = 200, userId?: string): Promise<MatchSummary> {
  const rows = await sql`
    SELECT t.id, t.title, a.name AS artist
    FROM tracks t JOIN artists a ON a.id = t.artist_id
    WHERE ${needsDeezer()} ${listenedBy(userId)}
    ORDER BY t.id
    LIMIT ${limit}`;

  const summary: MatchSummary = { checked: 0, matched: 0, missing: [], unreachable: false };
  for (const row of rows) {
    const title: string = row.title;
    const artist: string = row.artist;
    let match: DeezerMatch | null;
    try {
      match = await findDeezerTrack(artist, title);
    } catch {
      summary.unreachable = true;
      break;
    }
    summary.checked++;
    if (match) {
      await saveMatch(row.id, match);
      summary.matched++;
    } else {
      await sql`UPDATE tracks SET deezer_missing = true WHERE id = ${row.id}`;
      summary.missing.push(`${artist} – ${title}`);
    }
  }
  return summary;
}

export async function ensureDeezerId(trackId: string): Promise<number | null> {
  const [row] = await sql`
    SELECT t.deezer_id, t.title, a.name AS artist
    FROM tracks t JOIN artists a ON a.id = t.artist_id
    WHERE t.id = ${trackId}`;
  if (!row) return null;
  if (row.deezer_id != null) return row.deezer_id;

  const match = await findDeezerTrack(row.artist, row.title);
  if (!match) {
    await sql`UPDATE tracks SET deezer_missing = true WHERE id = ${trackId}`;
    return null;
  }
  await saveMatch(trackId, match);
  return match.deezerId;
}

export type TrackDetails = { cover: string; durationMs?: number };

export async function findTrackDetails(trackId: string, artist: string, title: string): Promise<TrackDetails | null> {
  const [row] = await sql`SELECT cover, duration_ms FROM tracks WHERE id = ${trackId}`;
  if (row?.cover) return { cover: row.cover, durationMs: row.duration_ms ?? undefined };

  const match = await findDeezerTrack(artist, title);
  if (!match) return null;
  await saveMatch(trackId, match);
  return { cover: match.cover, durationMs: match.durationMs };
}
