import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import {
  checkWantedInNavidrome,
  getDiscoverMix,
  getRediscoverMix,
  saveMixToNavidrome,
  saveYearToNavidrome,
  yearTopSongs,
} from "../../lib/mixes";
import { getNavidrome, NavidromeError, saveNavidrome } from "../../lib/navidrome";
import { sql } from "../../lib/postgres";
import { addWanted, getWanted } from "../../lib/wanted";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

process.env.AUTH_SECRET ??= "test-only-secret";

const user = testUser();
const friend = testUser();
const listener = testUser();
const band = `${user.artist} Band`;
const duo = `${user.artist} Duo`;
const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

type Song = { id: string; title: string; artist: string };
const library: Song[] = [];
const playlists = new Map<string, { name: string; songs: string[] }>();
let server: Server;
let url: string;

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
      response.end(JSON.stringify({ "subsonic-response": { status: "failed", error: { code: 40 } } }));
      return;
    }
    const method = address.pathname.replace(/^\/rest\/|\.view$/g, "");
    if (method === "ping") return response.end(subsonic({}));
    if (method === "search3") {
      const words = (params.get("query") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const song = library.filter((s) => words.every((word) => `${s.artist} ${s.title}`.toLowerCase().includes(word)));
      return response.end(subsonic({ searchResult3: { song } }));
    }
    if (method === "getPlaylists") {
      const playlist = [...playlists].map(([id, p]) => ({ id, name: p.name, owner: "dj" }));
      return response.end(subsonic({ playlists: { playlist } }));
    }
    if (method === "createPlaylist") {
      const id = params.get("playlistId") ?? `playlist-${playlists.size + 1}`;
      const name = params.get("name") ?? playlists.get(id)!.name;
      playlists.set(id, { name, songs: params.getAll("songId") });
      return response.end(subsonic({ playlist: { id } }));
    }
    response.statusCode = 404;
    response.end();
  });
}

before(async () => {
  server = fakeNavidrome();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await createTestUser(user.userId);
  await createTestUser(friend.userId);
  const played = (artist: string, title: string, days: number[]) =>
    days.map((day) => ({ artist, title, playedAt: daysAgo(day) }));
  await importListens(user.userId, [
    ...played(band, "Old Favourite", [200, 201, 202]),
    ...played(band, "Second Hit", [100, 120]),
    ...played(band, "Third Hit", [150, 151]),
    ...played(duo, "Deep Cut", [300, 301]),
    ...played(duo, "Recent", [5, 6, 7, 8, 9]),
    ...played(duo, "Only Once", [365]),
  ]);
  const in2024 = (artist: string, title: string, count: number) =>
    Array.from({ length: count }, (_, i) => ({ artist, title, playedAt: new Date(Date.UTC(2024, 4, 1 + i, 12)) }));
  await createTestUser(listener.userId);
  await importListens(listener.userId, [
    ...in2024(listener.artist, "Year Opener", 3),
    ...in2024(listener.artist, "Year Middle", 2),
    ...in2024(listener.artist, "Not Owned", 1),
  ]);
  await importListens(friend.userId, [
    ...played(duo, "Recent", [1]),
    ...played(duo, "Friend Pick", [1, 2]),
    ...played(band, "Friend Gem", [3]),
  ]);
});

after(async () => {
  server.close();
  for (const artist of [band, duo]) {
    await removeTestUser({ ...user, artist });
    await removeTestUser({ ...friend, artist });
  }
  await removeTestUser(listener);
  await closeConnections();
});

describe("Navidrome connection", () => {
  it("refuses a wrong password, a bad address and a server that is not there", async () => {
    await assert.rejects(saveNavidrome(user.userId, url, "dj", "wrong"), /did not accept/);
    await assert.rejects(saveNavidrome(user.userId, "ftp://music", "dj", "secret"), NavidromeError);
    await assert.rejects(saveNavidrome(user.userId, "http://127.0.0.1:9", "dj", "secret"), /unreachable/);
    assert.equal(await getNavidrome(user.userId), null);
  });

  it("stores the password encrypted", async () => {
    await saveNavidrome(user.userId, `${url}/app/`, "dj", "secret");
    const [row] = await sql`SELECT password FROM navidrome_settings WHERE user_id = ${user.userId}`;
    assert.notEqual(row?.password, "secret");
    assert.deepEqual(await getNavidrome(user.userId), { url, username: "dj", password: "secret" });
  });
});

describe("mixes", () => {
  it("rediscovers songs played more than once but not lately, two per artist at most", async () => {
    const mix = await getRediscoverMix(user.userId, now);
    assert.deepEqual(
      mix.map((song) => [song.title, song.plays]),
      [
        ["Old Favourite", 3],
        ["Deep Cut", 2],
        ["Third Hit", 2],
      ],
    );
  });

  it("discovers songs from listeners with similar taste", async () => {
    const mix = await getDiscoverMix(user.userId);
    assert.deepEqual(mix.map((song) => song.title).sort(), ["Friend Gem", "Friend Pick"]);
    assert.deepEqual(mix[0].via, [friend.userId]);
  });

  it("saves the songs found in Navidrome as a playlist and reports the missing ones", async () => {
    library.push(
      { id: "nd-1", title: "Old Favourite (2011 Remaster)", artist: `${band}, Guest Singer` },
      { id: "nd-2", title: "Deep Cut", artist: duo },
      { id: "nd-3", title: "Deep Cut", artist: "Someone Else" },
    );
    const saved = await saveMixToNavidrome(user.userId, "rediscover", now);
    const ids = (title: string, artist: string) => trackIdFor(artist, title);
    assert.deepEqual(saved.found, [ids("Old Favourite", band), ids("Deep Cut", duo)]);
    assert.deepEqual(saved.missing, [ids("Third Hit", band)]);
    assert.deepEqual([...playlists.values()], [{ name: "Soundscape Rediscover", songs: ["nd-1", "nd-2"] }]);

    library.push({ id: "nd-4", title: "Third Hit", artist: band });
    await saveMixToNavidrome(user.userId, "rediscover", now);
    assert.deepEqual([...playlists.values()], [{ name: "Soundscape Rediscover", songs: ["nd-1", "nd-2", "nd-4"] }]);
  });

  it("keeps wanted songs until they show up in Navidrome", async () => {
    const gem = trackIdFor(band, "Friend Gem");
    assert.equal(await addWanted(user.userId, gem), true);
    assert.equal(await addWanted(user.userId, "no-such-track"), false);
    const saved = await saveMixToNavidrome(user.userId, "discover", now);
    assert.ok(saved.missing.includes(gem));
    assert.deepEqual(
      (await getWanted(user.userId)).map((song) => song.title),
      ["Friend Gem"],
    );

    library.push({ id: "nd-5", title: "Friend Gem", artist: band });
    assert.deepEqual(
      (await checkWantedInNavidrome(user.userId)).map((song) => song.title),
      ["Friend Gem"],
    );
    assert.deepEqual(await getWanted(user.userId), []);
  });

  it("adds wanted songs that arrived to the next playlist", async () => {
    await addWanted(user.userId, trackIdFor(duo, "Recent"));
    library.push({ id: "nd-6", title: "Recent", artist: duo });
    const saved = await saveMixToNavidrome(user.userId, "rediscover", now);
    assert.deepEqual(
      saved.arrived.map((song) => song.title),
      ["Recent"],
    );
    const rediscover = [...playlists.values()].find((p) => p.name === "Soundscape Rediscover");
    assert.deepEqual(rediscover?.songs, ["nd-1", "nd-2", "nd-4", "nd-6"]);
    assert.deepEqual(await getWanted(user.userId), []);
  });
});

describe("Yearscape playlist", () => {
  it("picks a year's most played songs", async () => {
    assert.deepEqual(
      (await yearTopSongs(listener.userId, 2024)).map((song) => song.title),
      ["Year Opener", "Year Middle", "Not Owned"],
    );
  });

  it("saves the songs Navidrome has, in order, and names the missing ones", async () => {
    library.push(
      { id: "nd-y1", title: "Year Opener", artist: listener.artist },
      { id: "nd-y2", title: "Year Middle", artist: listener.artist },
    );
    await assert.rejects(saveYearToNavidrome(listener.userId, 2024), /Connect Navidrome/);
    await saveNavidrome(listener.userId, url, "dj", "secret");
    const saved = await saveYearToNavidrome(listener.userId, 2024);
    assert.equal(saved.playlist, "Soundscape 2024");
    assert.deepEqual([saved.songs, saved.found], [3, 2]);
    assert.deepEqual(
      saved.missing.map((song) => song.title),
      ["Not Owned"],
    );
    const playlist = [...playlists.values()].find((p) => p.name === "Soundscape 2024");
    assert.deepEqual(playlist?.songs, ["nd-y1", "nd-y2"]);
  });

  it("updates the same playlist when saved again", async () => {
    library.push({ id: "nd-y3", title: "Not Owned", artist: listener.artist });
    await saveYearToNavidrome(listener.userId, 2024);
    const years = [...playlists.values()].filter((p) => p.name === "Soundscape 2024");
    assert.equal(years.length, 1);
    assert.deepEqual(years[0].songs, ["nd-y1", "nd-y2", "nd-y3"]);
  });
});
