import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { fillArtistPhotos } from "../../lib/artist-photos";
import { getArtist } from "../../lib/artists";
import { artistIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { sql } from "../../lib/postgres";
import { searchArtists } from "../../lib/search";
import { localDay } from "../../lib/time";
import { getYearscape } from "../../lib/yearscape";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const { artist } = user;
const noImage = `${artist} Faceless`;
const unknown = `${artist} Nobody`;
const later = `${artist} Later`;
const searches: string[] = [];
const PHOTO = "https://cdn-images.example/images/artist/abc/250x250.jpg";
let server: Server;

function fakeDeezer() {
  return createServer((request, response) => {
    const url = new URL(request.url ?? "", "http://localhost");
    const query = url.searchParams.get("q") ?? "";
    if (url.pathname !== "/search/artist") return response.end(JSON.stringify({ data: [] }));
    searches.push(query);
    const data =
      query === artist
        ? [
            {
              id: 1,
              name: `${artist} (Karaoke)`,
              picture_medium: "https://cdn-images.example/karaoke.jpg",
              nb_fan: 9000,
            },
            { id: 2, name: artist, picture_medium: "https://cdn-images.example/small.jpg", nb_fan: 10 },
            { id: 3, name: artist, picture_medium: PHOTO, nb_fan: 500 },
          ]
        : query === noImage
          ? [
              {
                id: 4,
                name: noImage,
                picture_medium: "https://cdn-images.example/images/artist//250x250.jpg",
                nb_fan: 3,
              },
            ]
          : [];
    response.end(JSON.stringify({ data }));
  });
}

async function stored(name: string) {
  const [row] =
    await sql`SELECT photo, deezer_artist_id, photo_checked_at FROM artists WHERE id = ${artistIdFor(name)}`;
  return row;
}

before(async () => {
  server = fakeDeezer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.DEEZER_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.DEEZER_REQUEST_GAP_MS = "0";
  await createTestUser(user.userId);
  const playedAt = new Date(Date.now() - 3_600_000);
  await importListens(user.userId, [
    { artist, title: "Famous", playedAt },
    { artist, title: "Famous Again", playedAt },
    { artist: noImage, title: "Hidden", playedAt },
    { artist: unknown, title: "Lost", playedAt },
  ]);
});

after(async () => {
  server.close();
  for (const name of [artist, noImage, unknown, later]) await removeTestUser({ ...user, artist: name });
  await closeConnections();
});

describe("artist photos", () => {
  it("takes the photo of the artist with exactly that name and the most fans", async () => {
    const summary = await fillArtistPhotos({ userId: user.userId });
    assert.deepEqual(summary, { checked: 3, found: 1, unreachable: false });
    assert.equal(searches[0], artist);
    const row = await stored(artist);
    assert.equal(row.photo, PHOTO);
    assert.equal(row.deezer_artist_id, 3);
  });

  it("leaves out Deezer's empty placeholder and artists Deezer does not know", async () => {
    assert.equal((await stored(noImage)).photo, null);
    assert.equal((await stored(noImage)).deezer_artist_id, 4);
    assert.equal((await stored(unknown)).photo, null);
    assert.ok((await stored(unknown)).photo_checked_at instanceof Date);
  });

  it("does not ask again for a month", async () => {
    const before = searches.length;
    assert.deepEqual(await fillArtistPhotos({ userId: user.userId }), { checked: 0, found: 0, unreachable: false });
    const monthLater = Date.now() + 31 * 24 * 60 * 60 * 1000;
    assert.equal((await fillArtistPhotos({ userId: user.userId, now: monthLater })).checked, 2);
    assert.equal(searches.length, before + 2);
  });

  it("shows the photo on the artist page, in search and in Yearscape", async () => {
    assert.equal((await getArtist(artistIdFor(artist)))?.photo, PHOTO);
    const found = (await searchArtists(user.run)).find((a) => a.artistId === artistIdFor(artist));
    assert.equal(found?.cover, PHOTO);
    assert.equal(found?.photo, true);
    const scape = await getYearscape(user.userId, Number(localDay(new Date()).slice(0, 4)));
    const top = scape.topArtists.find((a) => a.name === artist);
    assert.equal(top?.cover, PHOTO);
    assert.equal(top?.photo, true);
    assert.notEqual(scape.topArtists.find((a) => a.name === noImage)?.photo, true);
  });

  it("stops without marking anything when Deezer is unreachable", async () => {
    await importListens(user.userId, [{ artist: later, title: "Song", playedAt: new Date(Date.now() - 60_000) }]);
    process.env.DEEZER_API_URL = "http://127.0.0.1:9";
    assert.deepEqual(await fillArtistPhotos({ userId: user.userId }), { checked: 0, found: 0, unreachable: true });
    assert.equal((await stored(later)).photo_checked_at, null);
  });
});
