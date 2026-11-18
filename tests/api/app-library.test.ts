import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { saveNavidrome } from "../../lib/navidrome";
import { createToken } from "../../lib/tokens";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

process.env.AUTH_SECRET ??= "test-only-secret";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const user = testUser();
const empty = testUser();
let token = "";
let emptyToken = "";
let navidrome: Server;

const songs = [
  {
    id: "car-2",
    title: "Second Gear",
    artist: user.artist,
    album: "Road Album",
    albumId: "road",
    track: 2,
    duration: 200,
    coverArt: "road",
  },
  {
    id: "car-1",
    title: "First Gear",
    artist: user.artist,
    album: "Road Album",
    albumId: "road",
    track: 1,
    duration: 180,
    coverArt: "road",
    replayGain: { trackGain: -6, albumGain: -4 },
  },
];

function subsonic(body: Record<string, unknown>) {
  return JSON.stringify({ "subsonic-response": { status: "ok", version: "1.16.1", ...body } });
}

function fakeNavidrome() {
  return createServer((request, response) => {
    const address = new URL(request.url ?? "", "http://localhost");
    const params = address.searchParams;
    const signed = createHash("md5")
      .update(`secret${params.get("s")}`)
      .digest("hex");
    if (params.get("u") !== "dj" || params.get("t") !== signed) {
      return response.end(JSON.stringify({ "subsonic-response": { status: "failed", error: { code: 40 } } }));
    }
    const method = address.pathname.replace(/^\/rest\/|\.view$/g, "");
    if (method === "ping") return response.end(subsonic({}));
    if (method === "getAlbumList2") {
      return response.end(
        subsonic({
          albumList2: {
            album: [
              { id: "road", name: "Road Album", artist: user.artist, coverArt: "road" },
              { id: "../bad", name: "Bad" },
            ],
          },
        }),
      );
    }
    if (method === "getAlbum" && params.get("id") === "road") {
      return response.end(subsonic({ album: { name: "Road Album", artist: user.artist, song: songs } }));
    }
    if (method === "getPlaylists") {
      return response.end(subsonic({ playlists: { playlist: [{ id: "trip", name: "Road Trip", songCount: 1 }] } }));
    }
    if (method === "getPlaylist" && params.get("id") === "trip") {
      return response.end(subsonic({ playlist: { name: "Road Trip", entry: [songs[0]] } }));
    }
    if (method === "getRandomSongs") return response.end(subsonic({ randomSongs: { song: songs } }));
    if (method === "search3") {
      const words = (params.get("query") ?? "").toLowerCase();
      return response.end(
        subsonic({ searchResult3: { song: songs.filter((song) => song.title.toLowerCase().includes(words)) } }),
      );
    }
    if (method === "getAlbum" || method === "getPlaylist") {
      return response.end(
        JSON.stringify({ "subsonic-response": { status: "failed", error: { code: 70, message: "Not found" } } }),
      );
    }
    response.statusCode = 404;
    response.end();
  });
}

function library(query: string, value = token) {
  return fetch(`${BASE_URL}/api/app/library?${query}`, {
    headers: { authorization: `Token ${value}`, "user-agent": "SoundscapeAndroid/test" },
  });
}

before(async () => {
  navidrome = fakeNavidrome();
  await new Promise<void>((resolve) => navidrome.listen(0, "127.0.0.1", resolve));
  await createTestUser(user.userId);
  await createTestUser(empty.userId);
  await saveNavidrome(user.userId, `http://127.0.0.1:${(navidrome.address() as AddressInfo).port}`, "dj", "secret");
  token = await createToken(user.userId, "Car test");
  emptyToken = await createToken(empty.userId, "Car test");
});

after(async () => {
  navidrome.close();
  await removeTestUser(user);
  await removeTestUser(empty);
  await closeConnections();
});

describe("the app's library for Android Auto", () => {
  it("needs the app's token", async () => {
    assert.equal((await fetch(`${BASE_URL}/api/app/library`)).status, 401);
    assert.equal((await library("node=root", "wrong")).status, 401);
  });

  it("opens on the tabs and says when Navidrome isn't connected", async () => {
    const root = await (await library("node=root")).json();
    assert.equal(root.connected, true);
    assert.deepEqual(
      root.items.map((item: { node: string }) => item.node),
      ["albums:added", "albums:played", "playlists", "shuffle"],
    );
    const nothing = await (await library("node=albums:added", emptyToken)).json();
    assert.deepEqual(nothing, { connected: false, title: "Soundscape", items: [] });
  });

  it("lists albums and plays one in track order", async () => {
    const albums = await (await library("node=albums:added")).json();
    assert.equal(albums.title, "New albums");
    assert.deepEqual(albums.items, [
      {
        kind: "folder",
        node: "album:road",
        title: "Road Album",
        subtitle: user.artist,
        cover: "/api/navidrome/cover/road",
        playable: true,
      },
    ]);
    const album = await (await library("node=album:road")).json();
    assert.equal(album.title, "Road Album");
    const tracks = album.items.map(
      (item: { track: { songId: string; title: string; level: number; cover: string } }) => item.track,
    );
    assert.deepEqual(
      tracks.map((track: { songId: string }) => track.songId),
      ["car-1", "car-2"],
    );
    assert.equal(tracks[0].cover, "/api/navidrome/cover/road");
    assert.ok(tracks[0].level < 1);
    assert.equal(typeof tracks[0].trackId, "string");
  });

  it("lists playlists, shuffles and searches", async () => {
    const playlists = await (await library("node=playlists")).json();
    assert.deepEqual(
      playlists.items.map((item: { node: string; subtitle: string }) => [item.node, item.subtitle]),
      [["playlist:trip", "1 song"]],
    );
    const trip = await (await library("node=playlist:trip")).json();
    assert.equal(trip.items[0].track.title, "Second Gear");
    const shuffle = await (await library("node=shuffle")).json();
    assert.equal(shuffle.items.length, 2);
    const found = await (await library("search=first")).json();
    assert.deepEqual(
      found.items.map((item: { track: { title: string } }) => item.track.title),
      ["First Gear"],
    );
    assert.equal((await library("search=%20")).status, 400);
  });

  it("refuses places that don't exist", async () => {
    assert.equal((await library("node=artist:x")).status, 404);
    assert.equal((await library("node=album:nope")).status, 502);
  });
});
