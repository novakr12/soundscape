import { getSimilarArtists } from "./artists";
import { artistIdFor, slug, songTitle } from "./catalog";
import { type MusicSong, toMusicSongs } from "./music";
import { getNavidrome } from "./navidrome";
import { getLibrarySongs, type NavidromeSong } from "./navidrome-library";
import { sql } from "./postgres";
import { getAlsoPlayed } from "./tracks";

export type RadioSeed = { trackId: string } | { artistId: string };

export const RADIO_BATCH = 25;
const MOST_ARTISTS = 10;
const SONGS_PER_ARTIST = 60;
const SEED_EVERY = 3;
const SEARCHES_AT_ONCE = 4;

export type RadioGroup = { artistId: string; songs: NavidromeSong[] };

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
  groups: RadioGroup[],
  options: { first?: NavidromeSong; exclude: Set<string>; limit: number; random?: () => number },
) {
  const random = options.random ?? Math.random;
  const seen = new Set<string>();
  const out: NavidromeSong[] = [];
  const take = (song: NavidromeSong | undefined) => {
    if (!song || options.exclude.has(song.id) || seen.has(song.id) || seen.has(songKey(song))) return false;
    seen.add(song.id);
    seen.add(songKey(song));
    out.push(song);
    return true;
  };
  take(options.first);
  const piles = groups.map((group) => shuffled(group.songs, random));
  const [seed, ...others] = piles;
  let turn = 0;
  let other = 0;
  while (out.length < options.limit && piles.some((pile) => pile.length > 0)) {
    turn++;
    const fromSeed = turn % SEED_EVERY === 1 || others.every((pile) => pile.length === 0);
    if (fromSeed && seed && seed.length > 0) {
      take(seed.shift());
      continue;
    }
    for (let tries = 0; tries < others.length; tries++) {
      const pile = others[other % others.length];
      other++;
      if (pile.length > 0) {
        take(pile.shift());
        break;
      }
    }
  }
  return out.slice(0, options.limit);
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

async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  }
  return out;
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
  const [similar, alsoPlayed] = await Promise.all([
    getSimilarArtists(start.artistId, MOST_ARTISTS),
    "trackId" in seed ? getAlsoPlayed(seed.trackId, 30) : Promise.resolve([]),
  ]);
  const names = new Map<string, string>([[start.artistId, start.name]]);
  for (const name of [...alsoPlayed.map((track) => track.artist), ...similar.map((artist) => artist.name)]) {
    if (names.size >= MOST_ARTISTS) break;
    if (!names.has(artistIdFor(name))) names.set(artistIdFor(name), name);
  }
  const groups = await inBatches([...names], SEARCHES_AT_ONCE, async ([artistId, name]) => {
    try {
      const found = await getLibrarySongs(server, { query: name, offset: 0, size: SONGS_PER_ARTIST });
      return { artistId, songs: found.filter((song) => artistIdFor(song.artist) === artistId) };
    } catch {
      return { artistId, songs: [] };
    }
  });
  const first = start.title
    ? groups[0].songs.find((song) => slug(songTitle(song.title)) === slug(songTitle(start.title ?? "")))
    : undefined;
  const mixed = mixRadio(groups, { first, exclude: new Set(exclude), limit });
  return toMusicSongs(mixed);
}
