import { artistIdFor } from "./catalog";
import { getValue, setValue } from "./kv";
import { albumKey } from "./music";
import type { Navidrome } from "./navidrome";
import { type AlbumSummary, getAlbumSummaries } from "./navidrome-library";
import { sql } from "./postgres";

const BATCH = 500;
const MOST_BATCHES = 20;
const CACHE_SECONDS = 60 * 60;

export function seededShuffle<T>(items: T[], seed: string) {
  let state = 0;
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function unplayedOf(albums: AlbumSummary[], played: Set<string>) {
  return albums.filter((album) => {
    const key = albumKey(artistIdFor(album.artist), album.name);
    return key !== null && !played.has(key);
  });
}

async function playedAlbums(userId: string) {
  const rows = await sql`
    SELECT DISTINCT t.album_id FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
    WHERE p.user_id = ${userId} AND t.album_id IS NOT NULL`;
  return new Set(rows.map((row) => row.album_id as string));
}

async function libraryAlbums(server: Navidrome) {
  const albums: AlbumSummary[] = [];
  for (let batch = 0; batch < MOST_BATCHES; batch++) {
    const found = await getAlbumSummaries(server, batch * BATCH, BATCH);
    albums.push(...found);
    if (found.length < BATCH) break;
  }
  return albums;
}

export async function unplayedAlbums(userId: string, server: Navidrome, today: string) {
  const key = `navidrome-albums:${userId}`;
  let albums = await getValue<AlbumSummary[]>(key);
  if (!albums) {
    albums = await libraryAlbums(server);
    await setValue(key, albums, CACHE_SECONDS);
  }
  const played = await playedAlbums(userId);
  return seededShuffle(unplayedOf(albums, played), `${userId}:${today}`).map((album) => album.id);
}
