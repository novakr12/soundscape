import { getSimilarArtists } from "./artists";
import { artistIdFor, slug, songTitle } from "./catalog";
import { type MusicSong, toMusicSongs } from "./music";
import { getNavidrome } from "./navidrome";
import { getLibrarySongs, getRandomSongs, type NavidromeSong } from "./navidrome-library";
import { sql } from "./postgres";
import { getAlsoPlayed } from "./tracks";

export type RadioSeed = { trackId: string } | { artistId: string };

export const RADIO_BATCH = 25;
const SIMILAR_ARTISTS = 8;
const GENRE_ARTISTS = 12;
const SONGS_PER_ARTIST = 40;
const GENRE_SONGS = 80;
const SEARCHES_AT_ONCE = 4;
const SEED_EVERY = 5;
const SPACING = 4;
const MOST_PER_ARTIST = 2;

function shuffled<T>(items: T[], random: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function songKey(song: NavidromeSong) {
  return `${artistIdFor(song.artist)}|${slug(songTitle(song.title))}`;
}

export function mixRadio(
  seed: NavidromeSong[],
  pools: NavidromeSong[][],
  options: { first?: NavidromeSong; exclude: Set<string>; limit: number; random?: () => number },
) {
  const random = options.random ?? Math.random;
  const seen = new Set<string>();
  const perArtist = new Map<string, number>();
  const out: NavidromeSong[] = [];
  const recent = () => out.slice(-SPACING).map((song) => artistIdFor(song.artist));
  const usable = (song: NavidromeSong, spaced: boolean) =>
    !options.exclude.has(song.id) &&
    !seen.has(song.id) &&
    !seen.has(songKey(song)) &&
    (perArtist.get(artistIdFor(song.artist)) ?? 0) < MOST_PER_ARTIST &&
    (!spaced || !recent().includes(artistIdFor(song.artist)));
  const take = (song: NavidromeSong) => {
    seen.add(song.id);
    seen.add(songKey(song));
    const artist = artistIdFor(song.artist);
    perArtist.set(artist, (perArtist.get(artist) ?? 0) + 1);
    out.push(song);
  };
  const pick = (pile: NavidromeSong[], spaced: boolean) => {
    const at = pile.findIndex((song) => usable(song, spaced));
    if (at < 0) return false;
    take(pile.splice(at, 1)[0]);
    return true;
  };
  if (options.first && !options.exclude.has(options.first.id)) take(options.first);
  const seedPile = shuffled(seed, random);
  const piles = shuffled(
    pools.filter((pool) => pool.length > 0).map((pool) => shuffled(pool, random)),
    random,
  );
  let turn = out.length;
  let next = 0;
  while (out.length < options.limit) {
    turn++;
    if (turn % SEED_EVERY === 0 && pick(seedPile, true)) continue;
    let placed = false;
    for (const spaced of [true, false]) {
      for (let tries = 0; tries < piles.length && !placed; tries++) {
        placed = pick(piles[next % piles.length], spaced);
        next++;
      }
      if (placed) break;
    }
    if (!placed && !pick(seedPile, false)) break;
  }
  return out;
}

async function seedArtist(seed: RadioSeed) {
  if ("trackId" in seed) {
    const [row] = await sql`
      SELECT t.title, a.id, a.name FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE t.id = ${seed.trackId}`;
    return row ? { artistId: row.id as string, name: row.name as string, title: row.title as string } : null;
  }
  const [row] = await sql`SELECT id, name FROM artists WHERE id = ${seed.artistId}`;
  return row ? { artistId: row.id as string, name: row.name as string, title: undefined } : null;
}

async function genreNeighbours(artistId: string, limit: number) {
  const rows = await sql`
    SELECT a.id, a.name, count(*) AS shared
    FROM artist_genres mine
    JOIN artist_genres theirs ON theirs.genre = mine.genre AND theirs.artist_id <> mine.artist_id
    JOIN artists a ON a.id = theirs.artist_id
    WHERE mine.artist_id = ${artistId}
    GROUP BY a.id, a.name
    ORDER BY shared DESC, random()
    LIMIT ${limit}`;
  return rows.map((row) => row.name as string);
}

async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  }
  return out;
}

export function mainGenre(songs: NavidromeSong[]) {
  const counts = new Map<string, number>();
  for (const song of songs) {
    if (song.genre) counts.set(song.genre, (counts.get(song.genre) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

export async function radioSongs(
  userId: string,
  seed: RadioSeed,
  exclude: string[],
  limit = RADIO_BATCH,
): Promise<MusicSong[] | null> {
  const server = await getNavidrome(userId);
  if (!server) return null;
  const start = await seedArtist(seed);
  if (!start) return [];
  const [similar, alsoPlayed, genreArtists] = await Promise.all([
    getSimilarArtists(start.artistId, SIMILAR_ARTISTS),
    "trackId" in seed ? getAlsoPlayed(seed.trackId, 20) : Promise.resolve([]),
    genreNeighbours(start.artistId, GENRE_ARTISTS),
  ]);
  const names = new Map<string, string>();
  for (const name of [
    ...alsoPlayed.map((track) => track.artist),
    ...similar.map((artist) => artist.name),
    ...genreArtists,
  ]) {
    const id = artistIdFor(name);
    if (id !== start.artistId && !names.has(id)) names.set(id, name);
  }
  const songsBy = async (artistId: string, name: string) => {
    try {
      const found = await getLibrarySongs(server, { query: name, offset: 0, size: SONGS_PER_ARTIST });
      return found.filter((song) => artistIdFor(song.artist) === artistId);
    } catch {
      return [];
    }
  };
  const seedSongs = await songsBy(start.artistId, start.name);
  const genre = mainGenre(seedSongs);
  const [artistPools, genrePool] = await Promise.all([
    inBatches([...names], SEARCHES_AT_ONCE, ([artistId, name]) => songsBy(artistId, name)),
    genre ? getRandomSongs(server, { size: GENRE_SONGS, genre }).catch(() => []) : Promise.resolve([]),
  ]);
  const byArtist = new Map<string, NavidromeSong[]>();
  for (const song of genrePool) {
    const id = artistIdFor(song.artist);
    if (id === start.artistId) continue;
    byArtist.set(id, [...(byArtist.get(id) ?? []), song]);
  }
  const first = start.title
    ? seedSongs.find((song) => slug(songTitle(song.title)) === slug(songTitle(start.title ?? "")))
    : undefined;
  const mixed = mixRadio(seedSongs, [...artistPools, ...byArtist.values()], {
    first,
    exclude: new Set(exclude),
    limit,
  });
  return toMusicSongs(mixed);
}
