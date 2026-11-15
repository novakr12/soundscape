import { request } from "./http";
import { getValue, setValue } from "./kv";
import { fromLrclib, fromNavidrome, type LrclibHit, type Lyrics } from "./lyrics-text";
import { call, getNavidrome, isSongId } from "./navidrome";
import { sql } from "./postgres";

const FOUND_SECONDS = 30 * 24 * 60 * 60;
const MISSING_SECONDS = 24 * 60 * 60;
const lrclib = () => process.env.LRCLIB_URL ?? "https://lrclib.net";

export type LyricsQuery = { trackId: string; songId?: string; artist?: string; title?: string; album?: string };

async function fromNavidromeFor(userId: string, songId: string) {
  const server = await getNavidrome(userId);
  if (!server) return null;
  try {
    const answer = await call<{ lyricsList?: { structuredLyrics?: Parameters<typeof fromNavidrome>[0] } }>(
      server,
      "getLyricsBySongId",
      [["id", songId]],
    );
    return fromNavidrome(answer.lyricsList?.structuredLyrics);
  } catch {
    return null;
  }
}

async function songFacts(query: LyricsQuery) {
  const [row] = await sql`
    SELECT t.title, a.name AS artist, t.duration_ms, al.title AS album
    FROM tracks t JOIN artists a ON a.id = t.artist_id LEFT JOIN albums al ON al.id = t.album_id
    WHERE t.id = ${query.trackId}`;
  const artist = (row?.artist as string | undefined) ?? query.artist;
  const title = (row?.title as string | undefined) ?? query.title;
  if (!artist || !title) return null;
  const durationMs = row?.duration_ms as number | null | undefined;
  return {
    artist,
    title,
    album: (row?.album as string | null | undefined) ?? query.album,
    seconds: durationMs ? durationMs / 1000 : undefined,
  };
}

async function fromLrclibFor(query: LyricsQuery) {
  const facts = await songFacts(query);
  if (!facts) return null;
  const url = new URL("/api/search", lrclib());
  url.searchParams.set("artist_name", facts.artist);
  url.searchParams.set("track_name", facts.title);
  if (facts.album) url.searchParams.set("album_name", facts.album);
  try {
    let response = await request(url, { timeoutMs: 8000 });
    let hits = response.ok ? ((await response.json()) as LrclibHit[]) : [];
    if (hits.length === 0 && facts.album) {
      url.searchParams.delete("album_name");
      response = await request(url, { timeoutMs: 8000 });
      hits = response.ok ? ((await response.json()) as LrclibHit[]) : [];
    }
    return Array.isArray(hits) ? fromLrclib(hits, facts.seconds) : null;
  } catch {
    return null;
  }
}

export async function findLyrics(userId: string, query: LyricsQuery): Promise<Lyrics | null> {
  const key = `lyrics:${query.songId ? `nd:${userId}:${query.songId}` : query.trackId}`;
  const cached = await getValue<{ lyrics: Lyrics | null }>(key);
  if (cached) return cached.lyrics;
  const lyrics =
    (query.songId && isSongId(query.songId) ? await fromNavidromeFor(userId, query.songId) : null) ??
    (await fromLrclibFor(query));
  await setValue(key, { lyrics }, lyrics ? FOUND_SECONDS : MISSING_SECONDS);
  return lyrics;
}
