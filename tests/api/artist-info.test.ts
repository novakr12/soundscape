import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { ensureArtistInfo, fillArtistInfo } from "../../lib/artist-info";
import { getArtist } from "../../lib/artists";
import { artistIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { sql } from "../../lib/postgres";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const band = user.artist;
const singer = `${user.artist} Singer`;
const BAND_MBID = "11111111-1111-1111-1111-111111111111";
const SINGER_MBID = "22222222-2222-2222-2222-222222222222";
const LONG = `${"word ".repeat(400)}end`;
let server: Server;
let wikipediaDown = false;

function fakeServices() {
  return createServer((request, response) => {
    const path = new URL(request.url ?? "", "http://localhost").pathname;
    const json = (body: unknown) => response.end(JSON.stringify(body));
    if (path === `/ws/2/artist/${BAND_MBID}`) {
      return json({
        type: "Group",
        area: { name: "United Kingdom" },
        "life-span": { begin: "1991-05-01", end: null, ended: false },
        relations: [
          { type: "wikidata", url: { resource: "https://www.wikidata.org/wiki/Q1" } },
          { type: "official homepage", url: { resource: "https://band.example/" } },
          { type: "bandcamp", url: { resource: "javascript:alert(1)" } },
          { type: "social network", url: { resource: "https://twitter.com/band" } },
          { type: "social network", url: { resource: "https://www.instagram.com/band/" } },
        ],
      });
    }
    if (path === `/ws/2/artist/${SINGER_MBID}`) {
      return json({ type: "Person", "life-span": { begin: "1950", end: "2000-01-01", ended: true }, relations: [] });
    }
    if (path === "/wiki/Special:EntityData/Q1.json") {
      return json({ entities: { Q1: { sitelinks: { enwiki: { title: "The Band" } } } } });
    }
    if (path === "/api/rest_v1/page/summary/The_Band") {
      if (wikipediaDown) {
        response.statusCode = 503;
        return response.end();
      }
      return json({
        type: "standard",
        extract: LONG,
        content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/The_Band" } },
      });
    }
    response.statusCode = 404;
    response.end();
  });
}

before(async () => {
  server = fakeServices();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.MUSICBRAINZ_URL = `${url}/ws/2`;
  process.env.MUSICBRAINZ_REQUEST_GAP_MS = "0";
  process.env.WIKIDATA_URL = url;
  process.env.WIKIPEDIA_URL = url;
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist: band, title: "Hit", playedAt: new Date(Date.now() - 120_000) },
    { artist: band, title: "Hit", playedAt: new Date(Date.now() - 60_000) },
    { artist: singer, title: "Ballad", playedAt: new Date(Date.now() - 30_000) },
  ]);
  await sql`UPDATE artists SET mbid = ${BAND_MBID} WHERE id = ${artistIdFor(band)}`;
  await sql`UPDATE artists SET mbid = ${SINGER_MBID} WHERE id = ${artistIdFor(singer)}`;
});

after(async () => {
  server.close();
  await removeTestUser(user);
  await removeTestUser({ ...user, artist: singer });
  await closeConnections();
});

describe("artist info", () => {
  it("waits when Wikipedia is unreachable", async () => {
    wikipediaDown = true;
    const summary = await fillArtistInfo({ userId: user.userId });
    assert.equal(summary.unreachable, true);
    assert.equal((await getArtist(artistIdFor(band)))?.infoChecked, false);
    wikipediaDown = false;
  });

  it("stores facts, a short Wikipedia bio and safe links", async () => {
    assert.deepEqual(await fillArtistInfo({ userId: user.userId }), { checked: 2, withBio: 1, unreachable: false });
    const artist = await getArtist(artistIdFor(band));
    assert.deepEqual(artist?.facts, ["Group", "United Kingdom", "since 1991"]);
    assert.ok(artist?.bio && artist.bio.length <= 1201 && artist.bio.endsWith("…"));
    assert.equal(artist?.bioUrl, "https://en.wikipedia.org/wiki/The_Band");
    assert.deepEqual(
      artist?.links.map((link) => link.label),
      ["Website", "Instagram", "MusicBrainz"],
    );
  });

  it("shows when someone's career ended and leaves out a missing bio", async () => {
    const artist = await getArtist(artistIdFor(singer));
    assert.deepEqual(artist?.facts, ["Person", "1950–2000"]);
    assert.equal(artist?.bio, undefined);
    assert.deepEqual(
      artist?.links.map((link) => link.label),
      ["MusicBrainz"],
    );
  });

  it("does not ask again until it is due", async () => {
    assert.equal((await fillArtistInfo({ userId: user.userId })).checked, 0);
    await sql`UPDATE artists SET info_checked_at = NULL, bio = NULL WHERE id = ${artistIdFor(band)}`;
    await ensureArtistInfo(artistIdFor(band));
    assert.ok((await getArtist(artistIdFor(band)))?.bio);
  });
});
