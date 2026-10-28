import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { trackIdFor } from "../../lib/catalog";
import { fillCoversFromCoverArtArchive } from "../../lib/coverartarchive";
import { importListens } from "../../lib/imports";
import { sql } from "../../lib/postgres";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const { userId, artist } = user;
const searched = trackIdFor(artist, "Found By Search");
const byMbid = trackIdFor(artist, "Has An Mbid");
const unknown = trackIdFor(artist, "Unknown");
const onDeezer = trackIdFor(artist, "On Deezer");
const MBID = "11111111-1111-1111-1111-111111111111";
const covered = new Set(["rg-album", "rg-compilation", "rg-second"]);
const requests: string[] = [];
let busyOnce = true;
const userAgents = new Set<string>();
let server: Server;

const release = (id: string, group: string, type: string, extra: object = {}) => ({
  id,
  status: "Official",
  date: "1998-01-16",
  "release-group": { id: group, "primary-type": type, ...extra },
});

function fakeMusicBrainz() {
  return createServer((request, response) => {
    const address = new URL(request.url ?? "", "http://localhost");
    userAgents.add(String(request.headers["user-agent"]));
    requests.push(address.pathname);
    const json = (body: object) => response.end(JSON.stringify(body));
    if (address.pathname === "/ws/2/recording") {
      const query = address.searchParams.get("query") ?? "";
      if (!query.includes("Found By Search") || !query.endsWith("AND status:official")) return json({ recordings: [] });
      return json({
        recordings: [
          { id: "rec-wrong", title: "Found By Search", "artist-credit": [{ name: "Someone Else" }], releases: [] },
          {
            id: "rec-1",
            title: "Found By Search",
            length: 241000,
            "artist-credit": [{ name: artist }],
            releases: [
              release("r-comp", "rg-compilation", "Album", { "secondary-types": ["Compilation"] }),
              release("r-album", "rg-album", "Album"),
            ],
          },
        ],
      });
    }
    if (address.pathname === `/ws/2/recording/${MBID}` && busyOnce) {
      busyOnce = false;
      response.statusCode = 503;
      return response.end();
    }
    if (address.pathname === `/ws/2/recording/${MBID}`) {
      return json({
        id: MBID,
        title: "Has An Mbid",
        "artist-credit": [{ name: artist }],
        releases: [release("r-first", "rg-no-cover", "Album"), release("r-second", "rg-second", "Single")],
      });
    }
    const cover = address.pathname.match(/^\/caa\/release-group\/([^/]+)\/front-250$/);
    if (cover && covered.has(cover[1])) {
      response.writeHead(307, { location: `http://images.example/${cover[1]}.jpg` });
      return response.end();
    }
    response.statusCode = 404;
    response.end();
  });
}

async function track(trackId: string) {
  const [row] = await sql`SELECT cover, duration_ms, mbid FROM tracks WHERE id = ${trackId}`;
  return { cover: row.cover, durationMs: row.duration_ms, mbid: row.mbid };
}

before(async () => {
  server = fakeMusicBrainz();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.MUSICBRAINZ_URL = `${url}/ws/2`;
  process.env.COVER_ART_ARCHIVE_URL = `${url}/caa`;
  process.env.MUSICBRAINZ_REQUEST_GAP_MS = "0";

  await createTestUser(userId);
  const playedAt = new Date(Date.now() - 86_400_000);
  await importListens(userId, [
    { artist, title: "Found By Search", playedAt },
    { artist, title: "Has An Mbid", playedAt, mbid: MBID },
    { artist, title: "Unknown", playedAt },
    { artist, title: "On Deezer", playedAt },
  ]);
  await sql`UPDATE tracks SET deezer_missing = true WHERE id = ANY(${[searched, byMbid, unknown]})`;
  await sql`UPDATE tracks SET cover = 'https://deezer.example/cover.jpg' WHERE id = ${onDeezer}`;
});

after(async () => {
  server.close();
  await removeTestUser(user);
  await closeConnections();
});

describe("covers from the Cover Art Archive", () => {
  it("finds the studio album's cover by searching MusicBrainz, and the song length", async () => {
    const summary = await fillCoversFromCoverArtArchive({ userId });
    assert.deepEqual(summary, { checked: 3, found: 2, unreachable: false });
    const song = await track(searched);
    assert.match(song.cover, /\/caa\/release-group\/rg-album\/front-250$/);
    assert.equal(song.durationMs, 241000);
    assert.equal(song.mbid, null);
  });

  it("uses the MusicBrainz ID a player sent, skipping albums without a cover", async () => {
    const song = await track(byMbid);
    assert.match(song.cover, /\/caa\/release-group\/rg-second\/front-250$/);
    assert.equal(requests.filter((path) => path === `/ws/2/recording/${MBID}`).length, 2);
    assert.equal(busyOnce, false);
  });

  it("leaves songs alone when nothing matches, and does not ask again for a month", async () => {
    assert.equal((await track(unknown)).cover, null);
    assert.equal((await track(onDeezer)).cover, "https://deezer.example/cover.jpg");
    requests.length = 0;
    assert.deepEqual(await fillCoversFromCoverArtArchive({ userId }), { checked: 0, found: 0, unreachable: false });
    assert.deepEqual(requests, []);
  });

  it("tells MusicBrainz who is asking", () => {
    assert.deepEqual([...userAgents], ["Soundscape/0.1 ( https://github.com/novakr12/soundscape )"]);
  });

  it("stops quietly when MusicBrainz is unreachable", async () => {
    await sql`UPDATE tracks SET cover_art_checked_at = NULL WHERE id = ${unknown}`;
    process.env.MUSICBRAINZ_URL = "http://127.0.0.1:9/ws/2";
    assert.deepEqual(await fillCoversFromCoverArtArchive({ userId }), { checked: 0, found: 0, unreachable: true });
  });
});
