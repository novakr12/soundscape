import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import {
  albumIdFor,
  albumOf,
  albumsBy,
  albumsFor,
  getAlbum,
  linkAlbums,
  topAlbums,
  trackNumber,
} from "../../lib/albums";
import { artistIdFor, trackIdFor } from "../../lib/catalog";
import { fillAlbumsFromDeezer } from "../../lib/deezer";
import { importListens } from "../../lib/imports";
import { albumsFromListenBrainz } from "../../lib/listenbrainz";
import { sql } from "../../lib/postgres";
import { searchAlbums } from "../../lib/search";
import { localDay } from "../../lib/time";
import { createToken } from "../../lib/tokens";
import { ensureTracklist } from "../../lib/tracklists";
import { getYearscape } from "../../lib/yearscape";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const user = testUser();
const friend = testUser();
let server: Server;
let token: string;
let albumLookups = 0;
let deezerDown = false;

const playedAt = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

function fakeDeezer() {
  return createServer((request, response) => {
    if (request.url?.startsWith("/user/")) {
      const listens = [
        {
          listened_at: 1,
          track_metadata: { artist_name: user.artist, track_name: "Guessed", release_name: "Real Album" },
        },
        {
          listened_at: 2,
          track_metadata: { artist_name: user.artist, track_name: "Never Played Here", release_name: "X" },
        },
      ];
      return response.end(JSON.stringify({ payload: { listens } }));
    }
    if (deezerDown) {
      response.statusCode = 503;
      return response.end("{}");
    }
    if (request.url?.startsWith("/search/album")) {
      albumLookups++;
      const q = new URL(request.url, "http://localhost").searchParams.get("q");
      const data =
        q === `${user.artist} First Album`
          ? [
              { id: 6, title: "First Album", artist: { name: "Somebody Else" } },
              { id: 7, title: "First Album", artist: { name: user.artist } },
            ]
          : [];
      return response.end(JSON.stringify({ data }));
    }
    if (request.url?.startsWith("/album/7/tracks")) {
      const data = [
        { title: "Opener (Remastered 2011)", track_position: 1, disk_number: 2 },
        { title: "Intro", track_position: 1, disk_number: 1 },
        { title: "Closer", track_position: 2, disk_number: 1 },
      ];
      return response.end(JSON.stringify({ data }));
    }
    const id = request.url?.match(/\/track\/(\d+)/)?.[1];
    if (id === "101") return response.end(JSON.stringify({ id: 101, album: { title: "Deezer Album" } }));
    response.end(JSON.stringify({ error: { type: "DataException", message: "no data", code: 800 } }));
  });
}

before(async () => {
  server = fakeDeezer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.DEEZER_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.DEEZER_REQUEST_GAP_MS = "0";
  process.env.LISTENBRAINZ_API_URL = process.env.DEEZER_API_URL;

  await createTestUser(user.userId);
  await createTestUser(friend.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: "Opener", album: "First  Album ", playedAt: playedAt(10) },
    { artist: user.artist, title: "Opener", album: "First Album", playedAt: playedAt(9) },
    { artist: user.artist, title: "Closer", album: "First Album", playedAt: playedAt(8) },
    { artist: user.artist, title: "Opener", album: "Greatest Hits", playedAt: playedAt(7) },
    { artist: user.artist, title: "Loose", playedAt: playedAt(6) },
  ]);
  await importListens(friend.userId, [
    { artist: user.artist, title: "Closer", album: "First Album", playedAt: playedAt(5) },
    { artist: user.artist, title: "Closer", playedAt: playedAt(4) },
    { artist: user.artist, title: "Closer", playedAt: playedAt(3) },
  ]);
  token = await createToken(user.userId, "Test");
});

after(async () => {
  server.close();
  await removeTestUser(user);
  await removeTestUser(friend);
  await closeConnections();
});

describe("albums", () => {
  const albumId = albumIdFor(user.artist, "First Album")!;

  it("keeps the album a play came from and the first one wins", async () => {
    assert.deepEqual(await albumOf(trackIdFor(user.artist, "Opener")), { albumId, title: "First Album" });
    assert.equal(await albumOf(trackIdFor(user.artist, "Loose")), null);
  });

  it("shows the album's songs, plays, listeners and your plays", async () => {
    const album = await getAlbum(albumId, user.userId);
    assert.equal(album?.title, "First Album");
    assert.equal(album?.artist, user.artist);
    assert.equal(album?.artistId, artistIdFor(user.artist));
    assert.deepEqual(
      album?.tracks.map((t) => [t.title, t.plays, t.yourPlays]),
      [
        ["Closer", 4, 1],
        ["Opener", 3, 3],
      ],
    );
    assert.equal(album?.plays, 7);
    assert.equal(album?.yourPlays, 4);
    assert.equal(album?.listeners, 2);
    assert.equal(await getAlbum(`${albumId}-nope`, null), null);
  });

  it("orders the album by Deezer's track list and shows songs nobody played", async () => {
    deezerDown = true;
    await ensureTracklist(albumId);
    assert.deepEqual(
      (await getAlbum(albumId, null))?.tracks.map((t) => t.title),
      ["Closer", "Opener"],
    );

    deezerDown = false;
    const now = Date.now();
    await ensureTracklist(albumId, now);
    const album = await getAlbum(albumId, user.userId);
    assert.deepEqual(
      album?.tracks.map((t) => [t.disc, t.number, t.title, t.trackId ?? null, t.plays]),
      [
        [1, 1, "Intro", null, 0],
        [1, 2, "Closer", trackIdFor(user.artist, "Closer"), 4],
        [2, 1, "Opener", trackIdFor(user.artist, "Opener"), 3],
      ],
    );
    assert.equal(album?.played, 2);

    const lookups = albumLookups;
    await ensureTracklist(albumId, now + 29 * 24 * 3_600_000);
    assert.equal(albumLookups, lookups);
    await ensureTracklist(albumId, now + 31 * 24 * 3_600_000);
    assert.equal(albumLookups, lookups + 1);
  });

  it("orders by the track numbers players send when Deezer doesn't know the album", async () => {
    await importListens(user.userId, [
      { artist: user.artist, title: "Side B", album: "Tape", trackNumber: 2, playedAt: playedAt(3) },
      { artist: user.artist, title: "Side B", album: "Tape", trackNumber: 2, playedAt: playedAt(3) },
      { artist: user.artist, title: "Side A", album: "Tape", trackNumber: 1, playedAt: playedAt(2) },
      { artist: user.artist, title: "Bonus", album: "Tape", playedAt: playedAt(1) },
    ]);
    const tapeId = albumIdFor(user.artist, "Tape")!;
    await ensureTracklist(tapeId);
    assert.deepEqual(
      (await getAlbum(tapeId, null))?.tracks.map((t) => [t.number ?? null, t.title]),
      [
        [1, "Side A"],
        [2, "Side B"],
        [null, "Bonus"],
      ],
    );
    assert.deepEqual(["3/12", 7, "x", 0, undefined].map(trackNumber), [3, 7, undefined, undefined, undefined]);
  });

  it("lists an artist's albums by plays", async () => {
    assert.deepEqual(
      (await albumsBy(artistIdFor(user.artist))).map((album) => [album.title, album.plays, album.tracks]),
      [
        ["First Album", 7, 2],
        ["Tape", 4, 3],
      ],
    );
  });

  it("takes the album from scrobbles", async () => {
    const response = await fetch(`${BASE_URL}/1/submit-listens`, {
      method: "POST",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        listen_type: "single",
        payload: [
          {
            listened_at: Math.floor(playedAt(2).getTime() / 1000),
            track_metadata: { artist_name: user.artist, track_name: "Scrobbled", release_name: "Live Album" },
          },
        ],
      }),
    });
    assert.equal(response.status, 200);
    assert.equal((await albumOf(trackIdFor(user.artist, "Scrobbled")))?.title, "Live Album");
  });

  it("fills in albums for songs Deezer already matched", async () => {
    await sql`UPDATE tracks SET deezer_id = 101 WHERE id = ${trackIdFor(user.artist, "Loose")}`;
    await sql`UPDATE tracks SET deezer_id = 102 WHERE id = ${trackIdFor(user.artist, "Closer")}`;
    await importListens(user.userId, [{ artist: user.artist, title: "Unknown", playedAt: playedAt(1) }]);
    await sql`UPDATE tracks SET deezer_id = 103 WHERE id = ${trackIdFor(user.artist, "Unknown")}`;

    let summary = await fillAlbumsFromDeezer(1000, user.userId);
    while (summary.checked > 0 && !summary.unreachable) summary = await fillAlbumsFromDeezer(1000, user.userId);
    assert.equal((await albumOf(trackIdFor(user.artist, "Loose")))?.title, "Deezer Album");
    assert.equal(await albumOf(trackIdFor(user.artist, "Unknown")), null);
    const [unknown] =
      await sql`SELECT deezer_album_missing FROM tracks WHERE id = ${trackIdFor(user.artist, "Unknown")}`;
    assert.equal(unknown.deezer_album_missing, true);
    assert.equal((await albumOf(trackIdFor(user.artist, "Closer")))?.title, "First Album");
  });

  it("lets the album from a player replace a Deezer guess, but not the other way round", async () => {
    const guessed = trackIdFor(user.artist, "Guessed");
    await importListens(user.userId, [{ artist: user.artist, title: "Guessed", playedAt: playedAt(1) }]);
    await linkAlbums([{ trackId: guessed, album: "Guessed (Single)" }], "deezer");
    assert.equal((await albumOf(guessed))?.title, "Guessed (Single)");

    assert.deepEqual(await albumsFromListenBrainz("someone"), { listens: 2, linked: 1 });
    assert.equal((await albumOf(guessed))?.title, "Real Album");
    assert.equal(await getAlbum(albumIdFor(user.artist, "Guessed (Single)")!, null), null);

    await linkAlbums([{ trackId: guessed, album: "Another Guess" }], "deezer");
    await linkAlbums([{ trackId: guessed, album: "Another Player Album" }]);
    assert.equal((await albumOf(guessed))?.title, "Real Album");
  });

  it("finds albums in search, history rows, top albums and Yearscape", async () => {
    const found = await searchAlbums(`${user.run} first`);
    assert.equal(found[0]?.albumId, albumId);
    assert.equal(found[0]?.artist, user.artist);

    const rows = await albumsFor([trackIdFor(user.artist, "Opener"), trackIdFor(user.artist, "Unknown")]);
    assert.deepEqual([...rows], [[trackIdFor(user.artist, "Opener"), { albumId, title: "First Album" }]]);

    const top = await topAlbums(friend.userId);
    assert.deepEqual(
      top.map((album) => [album.title, album.artist, album.plays]),
      [["First Album", user.artist, 3]],
    );

    const scape = await getYearscape(user.userId, Number(localDay(new Date()).slice(0, 4)));
    assert.deepEqual(scape.topAlbums.map((album) => album.title).slice(0, 1), ["First Album"]);
  });
});
