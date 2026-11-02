import { artistIdFor, trackIdFor } from "./catalog";
import { sql } from "./postgres";

export type Resolved = { trackId: string; artistId: string };

export async function resolveTracks(songs: { artist: string; title: string }[]): Promise<Resolved[]> {
  const raw = songs.map((song) => {
    const artistId = artistIdFor(song.artist);
    const trackId = trackIdFor(song.artist, song.title);
    return { trackId, artistId, titleSlug: trackId.slice(artistId.length + 1) };
  });
  if (raw.length === 0) return [];
  const artistAliases = new Map(
    (
      await sql`SELECT alias, artist_id FROM artist_aliases WHERE alias = ANY(${[...new Set(raw.map((r) => r.artistId))]})`
    ).map((row) => [row.alias as string, row.artist_id as string]),
  );
  const candidates = raw.map((r) => {
    const artistId = artistAliases.get(r.artistId);
    return artistId ? { ...r, trackId: `${artistId}-${r.titleSlug}`, artistId } : r;
  });
  const trackAliases = new Map(
    (
      await sql`
        SELECT x.alias, x.track_id, t.artist_id
        FROM track_aliases x JOIN tracks t ON t.id = x.track_id
        WHERE x.alias = ANY(${[...new Set([...raw, ...candidates].map((r) => r.trackId))]})`
    ).map((row) => [row.alias as string, { trackId: row.track_id as string, artistId: row.artist_id as string }]),
  );
  return raw.map((r, i) => {
    const alias = trackAliases.get(r.trackId) ?? trackAliases.get(candidates[i].trackId);
    return alias ?? { trackId: candidates[i].trackId, artistId: candidates[i].artistId };
  });
}

export async function resolveTrackId(artist: string, title: string) {
  return (await resolveTracks([{ artist, title }]))[0].trackId;
}

export async function artistAlias(alias: string): Promise<string | null> {
  const [row] = await sql`SELECT artist_id FROM artist_aliases WHERE alias = ${alias}`;
  return row?.artist_id ?? null;
}

export async function trackAlias(alias: string): Promise<string | null> {
  const [row] = await sql`SELECT track_id FROM track_aliases WHERE alias = ${alias}`;
  return row?.track_id ?? null;
}
