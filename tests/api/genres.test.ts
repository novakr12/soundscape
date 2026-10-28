import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { getArtist } from "../../lib/artists";
import { artistIdFor } from "../../lib/catalog";
import { fillGenres, pickGenres } from "../../lib/genres";
import { importListens } from "../../lib/imports";
import { localDay } from "../../lib/time";
import { getYearscape } from "../../lib/yearscape";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const [a, b, c] = [user.artist, `${user.artist} Two`, `${user.artist} Three`];
const genre = (name: string) => `t${user.run}-${name}`;
const requests: string[] = [];
let down = false;
let server: Server;

function fakeMusicBrainz() {
  return createServer((request, response) => {
    const url = new URL(request.url ?? "", "http://localhost");
    requests.push(url.pathname);
    if (down) {
      response.statusCode = 500;
      return response.end("{}");
    }
    const send = (body: unknown) => response.end(JSON.stringify(body));
    if (url.pathname === "/ws/2/recording/rec-a")
      return send({ "artist-credit": [{ artist: { id: "mb-a", name: a } }] });
    if (url.pathname === "/ws/2/artist/mb-a") {
      return send({
        genres: [
          { name: genre("rock"), count: 10 },
          { name: genre("pop"), count: 5 },
          { name: genre("rare"), count: 0 },
        ],
      });
    }
    if (url.pathname === "/ws/2/artist/mb-b") {
      return send({
        genres: [
          { name: genre("jazz"), count: 20 },
          { name: genre("lonely vote"), count: 1 },
        ],
      });
    }
    if (url.pathname === "/ws/2/artist") {
      const query = url.searchParams.get("query") ?? "";
      const artists = query.includes("Two")
        ? [
            { id: "mb-tribute", name: `${b} Tribute`, score: 100 },
            { id: "mb-b", name: b, score: 90 },
          ]
        : [];
      return send({ artists });
    }
    response.statusCode = 404;
    response.end("{}");
  });
}

async function genresOf(name: string) {
  return (await getArtist(artistIdFor(name)))?.genres ?? [];
}

before(async () => {
  server = fakeMusicBrainz();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.MUSICBRAINZ_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ws/2`;
  process.env.MUSICBRAINZ_REQUEST_GAP_MS = "0";
  await createTestUser(user.userId);
  const playedAt = new Date(Date.now() - 3_600_000);
  await importListens(user.userId, [
    { artist: a, title: "Song", mbid: "rec-a", playedAt },
    { artist: a, title: "Song", mbid: "rec-a", playedAt: new Date(playedAt.getTime() + 300_000) },
    { artist: a, title: "Song", mbid: "rec-a", playedAt: new Date(playedAt.getTime() + 600_000) },
    { artist: b, title: "Tune", playedAt },
    { artist: c, title: "Mystery", playedAt },
  ]);
});

after(async () => {
  server.close();
  for (const artist of [a, b, c]) await removeTestUser({ ...user, artist });
  await closeConnections();
});

describe("genres", () => {
  it("keeps up to five genres with a fair share of the votes", () => {
    assert.deepEqual(
      pickGenres([
        { name: "Rock", count: 40 },
        { name: "pop", count: 3 },
        { name: "art rock", count: 30 },
        { name: "indie", count: 4 },
      ]),
      ["rock", "art rock", "indie"],
    );
    assert.deepEqual(pickGenres([]), []);
  });

  it("stops without marking anything when MusicBrainz is down", async () => {
    down = true;
    const summary = await fillGenres({ userId: user.userId });
    down = false;
    assert.deepEqual(summary, { checked: 0, found: 0, unreachable: true });
    assert.deepEqual(await genresOf(a), []);
  });

  it("finds genres through recordings first, then by exact name", async () => {
    requests.length = 0;
    const summary = await fillGenres({ userId: user.userId });
    assert.deepEqual(summary, { checked: 3, found: 2, unreachable: false });
    assert.deepEqual(await genresOf(a), [genre("pop"), genre("rock")]);
    assert.deepEqual(await genresOf(b), [genre("jazz")]);
    assert.deepEqual(await genresOf(c), []);
    assert.equal(requests.filter((path) => path === "/ws/2/artist").length, 2);
  });

  it("does not ask again about artists it already checked", async () => {
    requests.length = 0;
    assert.equal((await fillGenres({ userId: user.userId })).checked, 0);
    const later = await fillGenres({ userId: user.userId, now: Date.now() + 91 * 24 * 3_600_000 });
    assert.equal(later.checked, 1);
    assert.deepEqual(requests, ["/ws/2/artist"]);
  });

  it("adds the top genres to Yearscape", async () => {
    const scape = await getYearscape(user.userId, Number(localDay(new Date(Date.now() - 3_600_000)).slice(0, 4)));
    assert.deepEqual(scape.topGenres, [
      { name: genre("pop"), plays: 3 },
      { name: genre("rock"), plays: 3 },
      { name: genre("jazz"), plays: 1 },
    ]);
  });
});
