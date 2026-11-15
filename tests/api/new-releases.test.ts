import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { artistIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { checkNewReleases, newReleasesFor } from "../../lib/new-releases";
import { listNotifications, notificationMessage, pushesSent } from "../../lib/notifications";
import { sql } from "../../lib/postgres";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const MBID = "33333333-3333-3333-3333-333333333333";
const NOW = new Date();
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);
let server: Server;
const asked: string[] = [];

before(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "", "http://localhost");
    if (url.pathname !== "/ws/2/release-group") {
      response.statusCode = 404;
      return response.end();
    }
    asked.push(url.searchParams.get("query") ?? "");
    response.end(
      JSON.stringify({
        "release-groups": [
          { id: "rg-new", title: "Brand New Record", "primary-type": "Album", "first-release-date": daysAgo(3) },
          { id: "rg-old", title: "Old Record", "primary-type": "Album", "first-release-date": daysAgo(400) },
          {
            id: "rg-live",
            title: "Live Record",
            "primary-type": "Album",
            "secondary-types": ["Live"],
            "first-release-date": daysAgo(2),
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.MUSICBRAINZ_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ws/2`;
  process.env.MUSICBRAINZ_REQUEST_GAP_MS = "0";
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: "Favourite", playedAt: new Date(Date.now() - 120_000) },
    { artist: user.artist, title: "Favourite", playedAt: new Date(Date.now() - 60_000) },
  ]);
  await sql`UPDATE artists SET mbid = ${MBID} WHERE id = ${artistIdFor(user.artist)}`;
});

after(async () => {
  server.close();
  await sql`DELETE FROM new_releases WHERE artist_id = ${artistIdFor(user.artist)}`;
  await removeTestUser(user);
  await closeConnections();
});

describe("new releases", () => {
  it("finds a new album by an artist you play and tells you once", async () => {
    const artistId = artistIdFor(user.artist);
    const first = await checkNewReleases(NOW, [artistId]);
    assert.deepEqual(first, { checked: 1, found: 1 });
    assert.match(asked[0], new RegExp(`arid:${MBID}`));

    const releases = await newReleasesFor(user.userId);
    assert.deepEqual(
      releases.map((release) => [release.title, release.kind, release.artist]),
      [["Brand New Record", "Album", user.artist]],
    );

    await pushesSent();
    const notifications = (await listNotifications(user.userId)).filter((n) => n.kind === "release");
    assert.equal(notifications.length, 1);
    assert.deepEqual(notificationMessage(user.userId, notifications[0]), {
      title: `New album from ${user.artist}`,
      body: "Brand New Record",
      url: `/artist/${encodeURIComponent(artistId)}`,
    });

    assert.deepEqual(await checkNewReleases(NOW, [artistId]), { checked: 0, found: 0 });
    await sql`UPDATE artists SET releases_checked_at = NULL WHERE id = ${artistId}`;
    assert.deepEqual(await checkNewReleases(NOW, [artistId]), { checked: 1, found: 0 });
    assert.equal((await listNotifications(user.userId)).filter((n) => n.kind === "release").length, 1);
  });
});
