import { createHash, randomBytes } from "node:crypto";
import { artistIdFor, slug, songTitle } from "./catalog";
import { sql } from "./postgres";
import { decrypt, encrypt, serverUrl } from "./servers";

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

export type SubsonicSong = { id: string; title?: string; artist?: string; coverArt?: string };

export class NavidromeError extends Error {}

export function normalizeServerUrl(input: string) {
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

async function call<T extends object = object>(server: Navidrome, method: string, params: [string, string][] = []) {
  let response: Response;
  try {
    response = await fetch(endpoint(server, method, params), {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
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
  return server;
}

export async function removeNavidrome(userId: string) {
  await sql`DELETE FROM navidrome_settings WHERE user_id = ${userId}`;
}

function artistIds(artist: string) {
  return new Set([artist, artist.split(/\s*(?:,|&|;|\/|\bx\b)\s*/i)[0]].map(artistIdFor));
}

function isSameSong(song: LibrarySong, candidate: SubsonicSong) {
  if (!candidate.title || !candidate.artist) return false;
  if (slug(songTitle(candidate.title)) !== slug(songTitle(song.title))) return false;
  const wanted = artistIds(song.artist);
  return [...artistIds(candidate.artist)].some((id) => wanted.has(id));
}

export async function findLibrarySong(server: Navidrome, song: LibrarySong): Promise<SubsonicSong | null> {
  for (const query of new Set([`${song.artist} ${songTitle(song.title)}`, songTitle(song.title)])) {
    const result = await call<{ searchResult3?: { song?: SubsonicSong[] } }>(server, "search3", [
      ["query", query],
      ["songCount", "50"],
      ["artistCount", "0"],
      ["albumCount", "0"],
    ]);
    const songs = result.searchResult3?.song ?? [];
    const match = songs.find((candidate) => isSameSong(song, candidate));
    if (match) return match;
  }
  return null;
}

export async function findInLibrary(server: Navidrome, song: LibrarySong): Promise<string | null> {
  return (await findLibrarySong(server, song))?.id ?? null;
}

export async function fetchCoverArt(server: Navidrome, coverArtId: string, size = 300) {
  let response: Response;
  try {
    response = await fetch(
      endpoint(server, "getCoverArt", [
        ["id", coverArtId],
        ["size", String(size)],
      ]),
      {
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
  } catch {
    throw new NavidromeError("Navidrome is unreachable at that address.");
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.startsWith("image/")) throw new NavidromeError("Navidrome has no cover for that song.");
  return { type, data: Buffer.from(await response.arrayBuffer()) };
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
