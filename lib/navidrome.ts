import { createHash, randomBytes } from "node:crypto";
import { artistIdFor, isSongId, mainArtist, slug, songTitle } from "./catalog";
import { request } from "./http";
import { sql } from "./postgres";
import { decrypt, encrypt, serverUrl } from "./servers";

export { isSongId };

const API_VERSION = "1.16.1";
const CLIENT = "soundscape";

export type Navidrome = {
  url: string;
  username: string;
  password: string;
};

export type LibrarySong = {
  trackId: string;
  title: string;
  artist: string;
};

export type SubsonicSong = {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  albumId?: string;
  coverArt?: string;
};

export class NavidromeError extends Error {}

function normalizeServerUrl(input: string) {
  const url = serverUrl(input);
  if (!url) throw new NavidromeError("Enter the full address with http:// or https://, like http://localhost:4533.");
  return url;
}

function endpoint(server: Navidrome, method: string, params: [string, string][]) {
  const salt = randomBytes(8).toString("hex");
  const query = new URLSearchParams([
    ["u", server.username],
    [
      "t",
      createHash("md5")
        .update(server.password + salt)
        .digest("hex"),
    ],
    ["s", salt],
    ["v", API_VERSION],
    ["c", CLIENT],
    ["f", "json"],
    ...params,
  ]);
  return `${server.url}/rest/${method}.view?${query}`;
}

type SubsonicResult = { status?: string; error?: { code?: number } };

export async function call<T extends object = object>(
  server: Navidrome,
  method: string,
  params: [string, string][] = [],
) {
  let response: Response;
  try {
    response = await request(endpoint(server, method, params), {
      timeoutMs: 10_000,
    });
  } catch {
    throw new NavidromeError("Navidrome is unreachable at that address.");
  }
  const body = (await response.json().catch(() => null)) as { "subsonic-response"?: SubsonicResult & T } | null;
  const result = body?.["subsonic-response"];
  if (!result) throw new NavidromeError("That address did not answer like a Navidrome server.");
  if (result.status !== "ok") {
    const wrongLogin = result.error?.code === 40;
    throw new NavidromeError(
      wrongLogin ? "Navidrome did not accept that username and password." : "Navidrome refused the request.",
    );
  }
  return result;
}

export async function getNavidrome(userId: string): Promise<Navidrome | null> {
  const [row] = await sql`SELECT server_url, username, password FROM navidrome_settings WHERE user_id = ${userId}`;
  return row ? { url: row.server_url, username: row.username, password: decrypt(row.password, "navidrome") } : null;
}

export async function saveNavidrome(userId: string, url: string, username: string, password: string) {
  const server = { url: normalizeServerUrl(url), username, password };
  await call(server, "ping");
  await sql`
    INSERT INTO navidrome_settings (user_id, server_url, username, password)
    VALUES (${userId}, ${server.url}, ${username}, ${encrypt(password, "navidrome")})
    ON CONFLICT (user_id) DO UPDATE SET server_url = excluded.server_url, username = excluded.username,
      password = excluded.password, created_at = now()`;
  forgetFullSongs();
  return server;
}

export async function removeNavidrome(userId: string) {
  await sql`DELETE FROM navidrome_settings WHERE user_id = ${userId}`;
  forgetFullSongs();
}

function artistIds(artist: string) {
  return new Set([artist, mainArtist(artist)].map(artistIdFor));
}

function isSameSong(song: LibrarySong, candidate: SubsonicSong) {
  if (!candidate.title || !candidate.artist) return false;
  if (slug(songTitle(candidate.title)) !== slug(songTitle(song.title))) return false;
  const wanted = artistIds(song.artist);
  return [...artistIds(candidate.artist)].some((id) => wanted.has(id));
}

export type LibrarySearch = { match: SubsonicSong | null; queries: string[]; seen: SubsonicSong[] };

async function searchLibrary(server: Navidrome, song: LibrarySong): Promise<LibrarySearch> {
  const queries: string[] = [];
  const seen = new Map<string, SubsonicSong>();
  for (const query of new Set([`${song.artist} ${songTitle(song.title)}`, songTitle(song.title)])) {
    queries.push(query);
    const result = await call<{ searchResult3?: { song?: SubsonicSong[] } }>(server, "search3", [
      ["query", query],
      ["songCount", "50"],
      ["artistCount", "0"],
      ["albumCount", "0"],
    ]);
    const songs = result.searchResult3?.song ?? [];
    for (const candidate of songs) seen.set(candidate.id, candidate);
    const match = songs.find((candidate) => isSameSong(song, candidate));
    if (match) return { match, queries, seen: [...seen.values()] };
  }
  return { match: null, queries, seen: [...seen.values()] };
}

export async function findLibrarySong(server: Navidrome, song: LibrarySong): Promise<SubsonicSong | null> {
  return (await searchLibrary(server, song)).match;
}

async function findInLibrary(server: Navidrome, song: LibrarySong): Promise<string | null> {
  return (await findLibrarySong(server, song))?.id ?? null;
}

const PASSED_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges"];

const REMEMBER_FOUND_MS = 10 * 60_000;
const REMEMBER_MISSING_MS = 2 * 60_000;
const REMEMBER_AT_MOST = 500;
const globalForFullSongs = globalThis as unknown as {
  soundscapeFullSongs?: Map<string, { songId: string | null; until: number }>;
};
globalForFullSongs.soundscapeFullSongs ??= new Map();
const remembered = globalForFullSongs.soundscapeFullSongs;

export function forgetFullSongs() {
  remembered.clear();
}

export type FullSongCheck = {
  full: boolean;
  reason: "found" | "navidrome-not-connected" | "unknown-song" | "not-found-in-navidrome" | "navidrome-error";
  detail?: string;
  lookedFor?: { artist: string; title: string };
  searched?: string[];
  navidromeAnswered?: { title?: string; artist?: string }[];
  songId?: string;
  album?: string;
  albumId?: string;
};

function remember(userId: string, trackId: string, songId: string | null, now: number) {
  if (remembered.size >= REMEMBER_AT_MOST) remembered.delete(remembered.keys().next().value as string);
  remembered.set(`${userId}\n${trackId}`, {
    songId,
    until: now + (songId ? REMEMBER_FOUND_MS : REMEMBER_MISSING_MS),
  });
}

export async function findFullSong(userId: string, trackId: string, now = Date.now()): Promise<string | null> {
  const known = remembered.get(`${userId}\n${trackId}`);
  if (known && known.until > now) return known.songId;
  return (await checkFullSong(userId, trackId, now)).songId ?? null;
}

export async function checkFullSong(userId: string, trackId: string, now = Date.now()): Promise<FullSongCheck> {
  const server = await getNavidrome(userId);
  if (!server) {
    remember(userId, trackId, null, now);
    return { full: false, reason: "navidrome-not-connected" };
  }
  const [track] = await sql`
    SELECT t.title, a.name AS artist FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE t.id = ${trackId}`;
  if (!track) return { full: false, reason: "unknown-song" };
  const lookedFor = { artist: track.artist as string, title: track.title as string };
  let search: LibrarySearch;
  try {
    search = await searchLibrary(server, { trackId, ...lookedFor });
  } catch (error) {
    remember(userId, trackId, null, now);
    return {
      full: false,
      reason: "navidrome-error",
      detail: error instanceof Error ? error.message : String(error),
      lookedFor,
    };
  }
  const songId = search.match && isSongId(search.match.id) ? search.match.id : null;
  remember(userId, trackId, songId, now);
  if (songId) {
    const { album, albumId } = search.match ?? {};
    return {
      full: true,
      reason: "found",
      lookedFor,
      songId,
      ...(typeof album === "string" ? { album } : {}),
      ...(typeof albumId === "string" ? { albumId } : {}),
    };
  }
  return {
    full: false,
    reason: "not-found-in-navidrome",
    lookedFor,
    searched: search.queries,
    navidromeAnswered: search.seen.slice(0, 10).map((song) => ({ title: song.title, artist: song.artist })),
  };
}

export async function streamSong(server: Navidrome, songId: string, range: string | null): Promise<Response> {
  if (!isSongId(songId)) return Response.json({ error: "Unknown song." }, { status: 404 });
  const waiting = new AbortController();
  const timer = setTimeout(() => waiting.abort(), 10_000);
  let upstream: Response;
  try {
    upstream = await request(
      endpoint(server, "stream", [
        ["id", songId],
        ["format", "raw"],
      ]),
      { headers: range ? { range } : {}, signal: waiting.signal },
    );
  } catch {
    return Response.json({ error: "Navidrome is unreachable." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || type.includes("json") || type.includes("xml")) {
    await upstream.body?.cancel();
    return Response.json(
      { error: "Navidrome couldn't play that song." },
      { status: upstream.status === 416 ? 416 : 404 },
    );
  }
  const headers = new Headers({ "cache-control": "private, no-store" });
  for (const name of PASSED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export class NavidromeBusy extends NavidromeError {}

export type CoverImage = { type: string; data: Buffer };

const COVERS_AT_ONCE = 6;
const COVER_RETRY_MS = 500;
const globalForCovers = globalThis as unknown as {
  soundscapeCoverGate?: { active: number; waiting: (() => void)[] };
  soundscapeCoverRequests?: Map<string, Promise<CoverImage | null>>;
};
globalForCovers.soundscapeCoverGate ??= { active: 0, waiting: [] };
globalForCovers.soundscapeCoverRequests ??= new Map();
const coverGate = globalForCovers.soundscapeCoverGate;
const coverRequests = globalForCovers.soundscapeCoverRequests;

async function takeCoverTurn() {
  if (coverGate.active < COVERS_AT_ONCE) {
    coverGate.active++;
    return;
  }
  await new Promise<void>((resolve) => coverGate.waiting.push(resolve));
}

function endCoverTurn() {
  const next = coverGate.waiting.shift();
  if (next) next();
  else coverGate.active--;
}

async function askForCover(server: Navidrome, coverArtId: string, size: number): Promise<CoverImage | null> {
  let response: Response;
  try {
    response = await request(
      endpoint(server, "getCoverArt", [
        ["id", coverArtId],
        ["size", String(size)],
      ]),
      { timeoutMs: 10_000 },
    );
  } catch {
    throw new NavidromeBusy("Navidrome didn't answer in time.");
  }
  if (response.status >= 500 || response.status === 429) {
    await response.body?.cancel().catch(() => {});
    throw new NavidromeBusy("Navidrome is busy.");
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.startsWith("image/")) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  return { type, data: Buffer.from(await response.arrayBuffer()) };
}

export function fetchCoverArt(server: Navidrome, coverArtId: string, size = 300): Promise<CoverImage | null> {
  const key = `${server.url}\n${server.username}\n${coverArtId}\n${size}`;
  const pending = coverRequests.get(key);
  if (pending) return pending;
  const work = (async () => {
    await takeCoverTurn();
    try {
      try {
        return await askForCover(server, coverArtId, size);
      } catch (error) {
        if (!(error instanceof NavidromeBusy)) throw error;
        await new Promise((resolve) => setTimeout(resolve, COVER_RETRY_MS));
        return await askForCover(server, coverArtId, size);
      }
    } finally {
      endCoverTurn();
    }
  })();
  coverRequests.set(key, work);
  const forget = () => {
    if (coverRequests.get(key) === work) coverRequests.delete(key);
  };
  work.then(forget, forget);
  return work;
}

export async function findAllInLibrary(server: Navidrome, songs: LibrarySong[], concurrency = 5) {
  const found = new Map<string, string>();
  let next = 0;
  async function worker() {
    while (next < songs.length) {
      const song = songs[next++];
      const id = await findInLibrary(server, song);
      if (id) found.set(song.trackId, id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, songs.length) }, worker));
  return found;
}

export async function savePlaylist(server: Navidrome, name: string, songIds: string[]) {
  const result = await call<{ playlists?: { playlist?: { id: string; name: string; owner?: string }[] } }>(
    server,
    "getPlaylists",
  );
  const playlists = result.playlists?.playlist ?? [];
  const existing = playlists.find((playlist) => playlist.name === name && playlist.owner === server.username);
  const target: [string, string] = existing ? ["playlistId", existing.id] : ["name", name];
  await call(server, "createPlaylist", [target, ...songIds.map((id): [string, string] => ["songId", id])]);
}
