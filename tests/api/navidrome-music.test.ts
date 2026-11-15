import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { saveNavidromeSong, toMusicSongs } from "../../lib/music";
import {
  getLibraries,
  getLibraryAlbums,
  getLibrarySongs,
  getNavidrome,
  getPlaylistSongs,
  getPlaylists,
  getSong,
  getSongsOfAlbums,
  saveNavidrome,
} from "../../lib/navidrome";
import { recordPlay } from "../../lib/plays";
import { sql } from "../../lib/postgres";
import { createToken } from "../../lib/tokens";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

process.env.AUTH_SECRET ??= "test-only-secret";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const user = testUser();
const stranger = testUser();
const songs = [
  {
    id: "known-1",
    title: "Known Song",
    artist: user.artist,
    album: "First",
    duration: 200,
    coverArt: "al-first",
    folder: "1",
  },
  { id: "new-1", title: "New Song", artist: user.artist, album: "Second", duration: 180, track: 4, folder: "1" },
  { id: "far-1", title: "Far Song", artist: user.artist, folder: "2" },
  { id: "../bad", title: "Bad Id", artist: user.artist, folder: "1" },
];
const seen: URLSearchParams[] = [];
let server: Server;

function subsonic(body: Record<string, unknown>) {
  return JSON.stringify({ "subsonic-response": { status: "ok", version: "1.16.1", ...body } });
}

function fakeNavidrome() {
  return createServer((request, response) => {
    const address = new URL(request.url ?? "", "http://localhost");
    const params = address.searchParams;
    const token = createHash("md5")
      .update(`secret${params.get("s")}`)
      .digest("hex");
    if (params.get("u") !== "dj" || params.get("t") !== token) {
      return response.end(JSON.stringify({ "subsonic-response": { status: "failed", error: { code: 40 } } }));
    }
    const method = address.pathname.replace(/^\/rest\/|\.view$/g, "");
    seen.push(params);
    if (method === "ping") return response.end(subsonic({}));
    if (method === "getMusicFolders") {
      return response.end(
        subsonic({
          musicFolders: { musicFolder: [{ id: 1, name: "music" }, { id: 2, name: "music 2" }, { name: "x" }] },
        }),
      );
    }
    if (method === "getPlaylists") {
      return response.end(
        subsonic({
          playlists: { playlist: [{ id: "pl-1", name: "Evening", songCount: 2, duration: 380 }, { id: 7 }] },
        }),
      );
    }
    if (method === "getPlaylist") {
      if (params.get("id") !== "pl-1") {
        return response.end(JSON.stringify({ "subsonic-response": { status: "failed", error: { code: 70 } } }));
      }
      return response.end(subsonic({ playlist: { name: "Evening", entry: [songs[1], songs[0], songs[3]] } }));
    }
    if (method === "getAlbumList2") {
      const albums = params.get("musicFolderId") === "2" ? [] : [{ id: "al-second" }, { id: "al-first" }, { id: 5 }];
      const from = Number(params.get("offset") ?? 0);
      return response.end(subsonic({ albumList2: { album: albums.slice(from, from + Number(params.get("size"))) } }));
    }
    if (method === "getAlbum") {
      const album =
        params.get("id") === "al-first"
          ? [
              { id: "first-3", title: "Disc Two Opener", artist: user.artist, discNumber: 2, track: 1 },
              { id: "first-2", title: "Track Two", artist: user.artist, discNumber: 1, track: 2 },
              { id: "first-1", title: "Track One", artist: user.artist, discNumber: 1, track: 1 },
            ]
          : [songs[1]];
      return response.end(subsonic({ album: { song: album } }));
    }
    if (method === "getSong") {
      const song = songs.find((s) => s.id === params.get("id"));
      if (!song)
        return response.end(JSON.stringify({ "subsonic-response": { status: "failed", error: { code: 70 } } }));
      return response.end(subsonic({ song }));
    }
    if (method === "search3") {
      const query = params.get("query") ?? "";
      const folder = params.get("musicFolderId");
      const found = songs.filter(
        (s) =>
          (!folder || s.folder === folder) && (query === '""' || s.title.toLowerCase().includes(query.toLowerCase())),
      );
      const from = Number(params.get("songOffset") ?? 0);
      return response.end(
        subsonic({ searchResult3: { song: found.slice(from, from + Number(params.get("songCount") ?? 20)) } }),
      );
    }
    response.statusCode = 404;
    response.end();
  });
}

before(async () => {
  server = fakeNavidrome();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  await createTestUser(user.userId);
  await createTestUser(stranger.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: "Known Song", playedAt: new Date(Date.now() - 3_600_000) },
  ]);
  await saveNavidrome(user.userId, `http://127.0.0.1:${(server.address() as AddressInfo).port}`, "dj", "secret");
});

after(async () => {
  server.close();
  await removeTestUser(user);
  await removeTestUser(stranger);
  await closeConnections();
});

describe("Browsing Navidrome", () => {
  it("lists libraries and playlists, skipping broken entries", async () => {
    const navidrome = (await getNavidrome(user.userId))!;
    assert.deepEqual(await getLibraries(navidrome), [
      { id: "1", name: "music" },
      { id: "2", name: "music 2" },
    ]);
    assert.deepEqual(await getPlaylists(navidrome), [{ id: "pl-1", name: "Evening", songCount: 2, duration: 380 }]);
  });

  it("gives a playlist's songs in their order", async () => {
    const navidrome = (await getNavidrome(user.userId))!;
    const playlist = await getPlaylistSongs(navidrome, "pl-1");
    assert.equal(playlist?.name, "Evening");
    assert.deepEqual(
      playlist?.songs.map((song) => song.id),
      ["new-1", "known-1"],
    );
    assert.equal(await getPlaylistSongs(navidrome, "../rest"), null);
  });

  it("pages through one library and searches it", async () => {
    const navidrome = (await getNavidrome(user.userId))!;
    seen.length = 0;
    const all = await getLibrarySongs(navidrome, { libraryId: "1", offset: 0, size: 10 });
    assert.deepEqual(
      all.map((song) => song.title),
      ["Known Song", "New Song"],
    );
    assert.equal(seen[0].get("query"), '""');
    assert.equal(seen[0].get("musicFolderId"), "1");
    const second = await getLibrarySongs(navidrome, { libraryId: "1", offset: 1, size: 1 });
    assert.deepEqual(
      second.map((song) => song.title),
      ["New Song"],
    );
    const far = await getLibrarySongs(navidrome, { libraryId: "2", query: "far", offset: 0, size: 10 });
    assert.deepEqual(
      far.map((song) => song.title),
      ["Far Song"],
    );
  });

  it("lists a library album by album in the chosen order", async () => {
    const navidrome = (await getNavidrome(user.userId))!;
    seen.length = 0;
    const albums = await getLibraryAlbums(navidrome, { libraryId: "1", order: "added", offset: 0, size: 21 });
    assert.deepEqual(albums, ["al-second", "al-first"]);
    assert.equal(seen[0].get("type"), "newest");
    assert.equal(seen[0].get("musicFolderId"), "1");
    assert.equal(seen[0].get("size"), "21");
    await getLibraryAlbums(navidrome, { order: "year", offset: 20, size: 21 });
    assert.equal(seen[1].get("type"), "byYear");
    assert.equal(seen[1].get("fromYear"), "9999");
    assert.equal(seen[1].get("offset"), "20");
    assert.equal(seen[1].get("musicFolderId"), null);
    const listed = await getSongsOfAlbums(navidrome, albums);
    assert.deepEqual(
      listed.map((song) => song.title),
      ["New Song", "Track One", "Track Two", "Disc Two Opener"],
    );
  });

  it("marks which songs Soundscape already knows and links their covers", async () => {
    const navidrome = (await getNavidrome(user.userId))!;
    const listed = await toMusicSongs(await getLibrarySongs(navidrome, { libraryId: "1", offset: 0, size: 10 }));
    assert.deepEqual(listed[0], {
      trackId: trackIdFor(user.artist, "Known Song"),
      songId: "known-1",
      title: "Known Song",
      artist: user.artist,
      cover: "/api/navidrome/cover/al-first",
      album: "First",
      duration: 200,
    });
    assert.equal(listed[1].newSong, true);
    assert.equal(listed[1].cover, undefined);
  });

  it("answers the desktop app only with a token, and says when Navidrome isn't connected", async () => {
    const theirs = await createToken(stranger.userId, "Music test");
    const ask = (token?: string) =>
      fetch(`${BASE_URL}/api/music/playlists`, token ? { headers: { authorization: `Token ${token}` } } : {});
    assert.equal((await ask()).status, 401);
    assert.equal((await ask("not-a-token")).status, 401);
    assert.deepEqual(await (await ask(theirs)).json(), { connected: false, playlists: [] });
  });

  it("adds a new song to Soundscape when it is played", async () => {
    const trackId = trackIdFor(user.artist, "New Song");
    assert.equal(await recordPlay(user.userId, trackId), null);
    assert.equal(await saveNavidromeSong(stranger.userId, "new-1"), null);
    assert.equal(await saveNavidromeSong(user.userId, "missing"), null);
    assert.equal(await saveNavidromeSong(user.userId, "new-1"), trackId);
    const [track] = await sql`
      SELECT t.title, t.duration_ms, a.title AS album
      FROM tracks t LEFT JOIN albums a ON a.id = t.album_id
      WHERE t.id = ${trackId}`;
    assert.deepEqual({ ...track }, { title: "New Song", duration_ms: 180_000, album: "Second" });
    const play = await recordPlay(user.userId, trackId);
    assert.equal(play?.title, "New Song");
    assert.equal(await getSong((await getNavidrome(user.userId))!, "../bad"), null);
  });
});
