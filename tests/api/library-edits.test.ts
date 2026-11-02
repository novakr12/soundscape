import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { albumOf } from "../../lib/albums";
import { artistIdFor, trackIdFor } from "../../lib/catalog";
import { importListens } from "../../lib/imports";
import { mergeArtist, mergeSong, renameArtist, renameSong } from "../../lib/library-edits";
import { sql } from "../../lib/postgres";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const user = testUser();
const band = `${user.artist} Band`;
const typo = `${user.artist} Bnad`;
const renamed = `${user.artist} Renamed`;
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function plays(trackId: string) {
  const [row] = await sql`SELECT plays FROM user_track_plays WHERE user_id = ${user.userId} AND track_id = ${trackId}`;
  return row?.plays ?? 0;
}

async function exists(table: "artists" | "tracks", id: string) {
  return (await sql`SELECT 1 FROM ${sql(table)} WHERE id = ${id}`).length > 0;
}

before(async () => {
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist: band, title: "Hit", playedAt: ago(60), album: "First" },
    { artist: band, title: "Hit", playedAt: ago(50) },
    { artist: band, title: "Hit Take Two", playedAt: ago(40) },
    { artist: typo, title: "Hit", playedAt: ago(30) },
    { artist: typo, title: "B Side", playedAt: ago(20), album: "First" },
  ]);
});

after(async () => {
  for (const artist of [band, typo, renamed]) await removeTestUser({ ...user, artist });
  await closeConnections();
});

describe("fixing the library", () => {
  it("renames a song without moving it when only the spelling changes", async () => {
    const id = trackIdFor(band, "Hit");
    assert.equal(await renameSong(id, "HIT"), id);
    const [row] = await sql`SELECT title FROM tracks WHERE id = ${id}`;
    assert.equal(row.title, "HIT");
    await renameSong(id, "Hit");
  });

  it("merges two versions of a song, and new plays of the old one follow", async () => {
    const hit = trackIdFor(band, "Hit");
    const take = trackIdFor(band, "Hit Take Two");
    assert.equal(await mergeSong(take, hit), hit);
    assert.equal(await plays(hit), 3);
    assert.equal(await exists("tracks", take), false);
    await importListens(user.userId, [{ artist: band, title: "Hit Take Two", playedAt: ago(10) }]);
    assert.equal(await plays(hit), 4);
    assert.equal(await exists("tracks", take), false);
  });

  it("sends the old song page to the merged one", async () => {
    const response = await fetch(`${BASE_URL}/track/${trackIdFor(band, "Hit Take Two")}`, { redirect: "manual" });
    assert.equal(response.status, 307);
    assert.match(response.headers.get("location") ?? "", new RegExp(`/track/${trackIdFor(band, "Hit")}$`));
  });

  it("merges a misspelt artist with its songs and albums, and new plays follow", async () => {
    assert.equal(await mergeArtist(artistIdFor(typo), band), artistIdFor(band));
    assert.equal(await exists("artists", artistIdFor(typo)), false);
    assert.equal(await plays(trackIdFor(band, "Hit")), 5);
    assert.equal(await plays(trackIdFor(band, "B Side")), 1);
    assert.equal((await albumOf(trackIdFor(band, "B Side")))?.albumId, `${artistIdFor(band)}-first`);

    await importListens(user.userId, [{ artist: typo, title: "B Side", playedAt: ago(5) }]);
    assert.equal(await plays(trackIdFor(band, "B Side")), 2);
    assert.equal(await exists("artists", artistIdFor(typo)), false);
  });

  it("refuses merges that make no sense", async () => {
    await assert.rejects(mergeArtist(artistIdFor(band), `${user.artist} Nobody`), /no artist called/);
    await assert.rejects(mergeArtist(artistIdFor(band), band), /same artist/);
    await assert.rejects(mergeSong(trackIdFor(band, "Hit"), trackIdFor(band, "Hit")), /same song/);
  });

  it("renames an artist to a new address and keeps everything", async () => {
    const newId = await renameArtist(artistIdFor(band), renamed);
    assert.equal(newId, artistIdFor(renamed));
    assert.equal(await plays(trackIdFor(renamed, "Hit")), 5);
    assert.equal(await exists("tracks", trackIdFor(band, "Hit")), false);
    await importListens(user.userId, [{ artist: band, title: "Hit", playedAt: ago(1) }]);
    assert.equal(await plays(trackIdFor(renamed, "Hit")), 6);
    const response = await fetch(`${BASE_URL}/artist/${artistIdFor(typo)}`, { redirect: "manual" });
    assert.match(response.headers.get("location") ?? "", new RegExp(`/artist/${artistIdFor(renamed)}$`));
  });

  it("will not rename onto an existing artist", async () => {
    await importListens(user.userId, [{ artist: band, title: "Fresh", playedAt: ago(1) }]);
    const [{ artist_id }] = await sql`SELECT artist_id FROM tracks WHERE id = ${trackIdFor(renamed, "Fresh")}`;
    assert.equal(artist_id, artistIdFor(renamed));
    await importListens(user.userId, [{ artist: `${user.artist} Other`, title: "Song", playedAt: ago(1) }]);
    await assert.rejects(renameArtist(artistIdFor(renamed), `${user.artist} Other`), /Merge into it instead/);
    await removeTestUser({ ...user, artist: `${user.artist} Other` });
  });
});
