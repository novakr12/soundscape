import { getSimilarArtists } from "./artists";
import { artistIdFor, slug, songTitle, trackIdFor } from "./catalog";
import { type MusicSong, toMusicSongs } from "./music";
import { getNavidrome } from "./navidrome";
import { getLibrarySongs, getRandomSongs, type NavidromeSong } from "./navidrome-library";
import { sql } from "./postgres";
import { shuffled } from "./shuffle";
import { similarArtists } from "./similar-artists";
import { getAlsoPlayed } from "./tracks";

export type RadioSeed = { trackId: string } | { artistId: string };
export type RadioMore = { artist?: string; title?: string; continuing?: boolean; skipTracks?: string[] };

export const RADIO_BATCH = 25;
const SIMILAR_ARTISTS = 8;
const RELATED_ARTISTS = 20;
const GENRE_ARTISTS = 12;
const SONGS_PER_ARTIST = 40;
const GENRE_SONGS = 80;
const SEARCHES_AT_ONCE = 4;
const SEED_EVERY = 5;
const SPACING = 4;
const MOST_PER_ARTIST = 2;

function songKey(song: NavidromeSong) {
  return `${artistIdFor(song.artist)}|${slug(songTitle(song.title))}`;
}

export function mixRadio(
  seed: NavidromeSong[],
  pools: NavidromeSong[][],
  options: {
    first?: NavidromeSong;
    exclude: Set<string>;
    skipTracks?: Set<string>;
    limit: number;
    random?: () => number;
  },
) {
  const random = options.random ?? Math.random;
  const seen = new Set<string>();
  const perArtist = new Map<string, number>();
  const out: NavidromeSong[] = [];
  const recent = () => out.slice(-SPACING).map((song) => artistIdFor(song.artist));
  const usable = (song: NavidromeSong, spaced: boolean) =>
    !options.exclude.has(song.id) &&
    !options.skipTracks?.has(trackIdFor(song.artist, song.title)) &&
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

async function seedArtist(seed: RadioSeed, more: RadioMore) {
  if ("trackId" in seed) {
    const [row] = await sql`
      SELECT t.title, a.id, a.name FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE t.id = ${seed.trackId}`;
    if (row) return { artistId: row.id as string, name: row.name as string, title: row.title as string };
    const artist = more.artist?.trim();
    return artist && artistIdFor(artist) ? { artistId: artistIdFor(artist), name: artist, title: more.title } : null;
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
    HAVING count(*) >= least(2, (SELECT count(*) FROM artist_genres WHERE artist_id = ${artistId}))
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

const GENRE_FILLER = new Set(["and", "music", "the"]);

export function genreWords(genres: Iterable<string | undefined>) {
  const words = new Set<string>();
  for (const genre of genres) {
    for (const word of (genre ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (word.length > 1 && !GENRE_FILLER.has(word)) words.add(word);
    }
  }
  return words;
}

export function clearlySharesGenre(seed: Set<string>, other: Set<string>) {
  return seed.size > 0 && other.size > 0 && sharesGenre(seed, other);
}

export function sharesGenre(seed: Set<string>, other: Set<string>) {
  if (seed.size === 0 || other.size === 0) return true;
  for (const word of other) if (seed.has(word)) return true;
  return false;
}

async function genresOf(artistIds: string[]) {
  const out = new Map<string, string[]>();
  if (artistIds.length === 0) return out;
  const rows = await sql`SELECT artist_id, genre FROM artist_genres WHERE artist_id = ANY(${artistIds})`;
  for (const row of rows) {
    const id = row.artist_id as string;
    let genres = out.get(id);
    if (!genres) {
      genres = [];
      out.set(id, genres);
    }
    genres.push(row.genre as string);
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
  more: RadioMore = {},
  limit = RADIO_BATCH,
): Promise<MusicSong[] | null> {
  const server = await getNavidrome(userId);
  if (!server) return null;
  const start = await seedArtist(seed, more);
  if (!start) return [];
  const [related, similar, alsoPlayed, genreArtists] = await Promise.all([
    similarArtists(start.name, RELATED_ARTISTS),
    getSimilarArtists(start.artistId, SIMILAR_ARTISTS),
    "trackId" in seed ? getAlsoPlayed(seed.trackId, 20) : Promise.resolve([]),
    genreNeighbours(start.artistId, GENRE_ARTISTS),
  ]);
  const listenedWith = [...alsoPlayed.map((track) => track.artist), ...similar.map((artist) => artist.name)];
  const known = await genresOf([start.artistId, ...listenedWith.map((name) => artistIdFor(name))]);
  const names = new Map<string, string>();
  const add = (name: string) => {
    const id = artistIdFor(name);
    if (id && id !== start.artistId && !names.has(id)) names.set(id, name);
  };
  for (const name of related) add(name);
  for (const name of genreArtists) add(name);
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
  const seedWords = genreWords([...(known.get(start.artistId) ?? []), genre]);
  const fits = (song: NavidromeSong) => sharesGenre(seedWords, genreWords([song.genre]));
  for (const name of listenedWith) {
    if (clearlySharesGenre(seedWords, genreWords(known.get(artistIdFor(name)) ?? []))) add(name);
  }
  const [artistPools, genrePool] = await Promise.all([
    inBatches([...names], SEARCHES_AT_ONCE, async ([artistId, name]) => (await songsBy(artistId, name)).filter(fits)),
    genre ? getRandomSongs(server, { size: GENRE_SONGS, genre }).catch(() => []) : Promise.resolve([]),
  ]);
  const byArtist = new Map<string, NavidromeSong[]>();
  for (const song of genrePool) {
    const id = artistIdFor(song.artist);
    if (id === start.artistId) continue;
    let group = byArtist.get(id);
    if (!group) {
      group = [];
      byArtist.set(id, group);
    }
    group.push(song);
  }
  const skipTracks = new Set(more.skipTracks ?? []);
  if (more.continuing && start.title) skipTracks.add(trackIdFor(start.name, start.title));
  const first =
    start.title && !more.continuing
      ? seedSongs.find((song) => slug(songTitle(song.title)) === slug(songTitle(start.title ?? "")))
      : undefined;
  const mixed = mixRadio(seedSongs, [...artistPools, ...byArtist.values()], {
    first,
    exclude: new Set(exclude),
    skipTracks,
    limit,
  });
  return toMusicSongs(mixed);
}
