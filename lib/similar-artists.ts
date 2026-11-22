import { artistIdFor, mainArtist } from "./catalog";
import { deezerRelatedArtists } from "./deezer";
import { artistFromSearch } from "./genres";
import { request } from "./http";
import { sql } from "./postgres";

const listenBrainz = () => process.env.LISTENBRAINZ_API_URL ?? "https://api.listenbrainz.org/1";
const KEPT_MS = 24 * 60 * 60 * 1000;
const MAX_KEPT = 500;
const kept = new Map<string, { names: string[]; at: number }>();

type RadioPick = { similar_artist_name?: string };

async function mbidFor(artistId: string, name: string) {
  const [row] = await sql`SELECT mbid FROM artists WHERE id = ${artistId}`;
  if (row?.mbid) return row.mbid as string;
  const mbid = await artistFromSearch(name).catch(() => null);
  if (mbid) {
    if (row) await sql`UPDATE artists SET mbid = ${mbid} WHERE id = ${artistId} AND mbid IS NULL`;
    return mbid;
  }
  const primary = mainArtist(name);
  if (!primary || primary === name) return null;
  return artistFromSearch(primary).catch(() => null);
}

export async function listenBrainzSimilar(mbid: string, limit: number): Promise<string[]> {
  const query = new URLSearchParams({
    mode: "easy",
    max_similar_artists: String(limit),
    max_recordings_per_artist: "1",
    pop_begin: "0",
    pop_end: "100",
  });
  const response = await request(`${listenBrainz()}/lb-radio/artist/${encodeURIComponent(mbid)}?${query}`, {
    timeoutMs: 10_000,
  });
  if (!response.ok) return [];
  const body = (await response.json()) as Record<string, RadioPick[]>;
  return Object.entries(body)
    .filter(([id]) => id !== mbid)
    .map(([, picks]) => picks[0])
    .filter((pick): pick is RadioPick & { similar_artist_name: string } => Boolean(pick?.similar_artist_name))
    .map((pick) => pick.similar_artist_name);
}

export async function similarArtists(name: string, limit: number): Promise<string[]> {
  const artistId = artistIdFor(name);
  const known = kept.get(artistId);
  if (known) {
    if (Date.now() - known.at < KEPT_MS) return known.names;
    kept.delete(artistId);
  }
  const [fromListenBrainz, fromDeezer] = await Promise.all([
    mbidFor(artistId, name)
      .then((mbid) => (mbid ? listenBrainzSimilar(mbid, limit) : []))
      .catch(() => []),
    deezerRelatedArtists(name, limit),
  ]);
  const seen = new Set<string>();
  const names = [...fromListenBrainz, ...fromDeezer].filter((other) => {
    const id = artistIdFor(other);
    if (!id || id === artistId || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!kept.has(artistId) && kept.size >= MAX_KEPT) {
    const oldest = kept.keys().next().value;
    if (oldest !== undefined) kept.delete(oldest);
  }
  kept.set(artistId, { names, at: Date.now() });
  return names;
}
