import { albumIdFor } from "./lib/albums";
import { artistIdFor, trackIdFor } from "./lib/catalog";
import { moveTrack } from "./lib/library-edits";
import { sql } from "./lib/postgres";

const MOST_SONGS_BY = "山下達郎";
const SONGS_BY_SOMEONE_ELSE: Record<string, string> = {
  "흰천장 (White Ceiling)": "",
  "群青の炎 -ULTRAMARINE FIRE-": "",
};

const apply = process.argv.includes("--apply");
const artistOf = (title: string) => SONGS_BY_SOMEONE_ELSE[title] ?? MOST_SONGS_BY;

if (artistIdFor(MOST_SONGS_BY) !== "山下達郎") {
  console.log("Update Soundscape first (slice188), then run this again.");
  process.exit(1);
}

const tracks = await sql`
  SELECT t.id, t.title, t.album_id, (SELECT count(*) FROM plays p WHERE p.track_id = t.id)::int AS plays
  FROM tracks t WHERE t.artist_id = '' ORDER BY t.title`;
const albums = await sql`SELECT id, title FROM albums WHERE artist_id = ''`;

const plan = tracks.map((track) => {
  const artist = artistOf(track.title);
  return { ...track, artist, to: artist ? trackIdFor(artist, track.title) : null };
});
const albumPlan = albums.map((album) => {
  const artist = plan.find((track) => track.album_id === album.id && track.artist)?.artist ?? MOST_SONGS_BY;
  return { ...album, artist, to: albumIdFor(artist, album.title) };
});

for (const track of plan) {
  console.log(
    track.to
      ? `${track.title}  (${track.plays} plays)  ->  ${track.artist}`
      : `${track.title}  (${track.plays} plays)  ->  skipped, fill in its artist at the top of this file`,
  );
}
for (const album of albumPlan) console.log(`album ${album.title}  ->  ${album.artist}`);

if (!apply) {
  console.log("\nNothing changed yet. If this looks right, run it again with --apply");
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  const artists = new Set([...plan.map((track) => track.artist), ...albumPlan.map((album) => album.artist)]);
  for (const name of artists) {
    if (name) await tx`INSERT INTO artists (id, name) VALUES (${artistIdFor(name)}, ${name}) ON CONFLICT (id) DO NOTHING`;
  }
  for (const album of albumPlan) {
    if (!album.to) continue;
    const taken = (await tx`SELECT 1 FROM albums WHERE id = ${album.to}`).length > 0;
    if (taken) {
      await tx`UPDATE tracks SET album_id = ${album.to} WHERE album_id = ${album.id}`;
      await tx`DELETE FROM albums WHERE id = ${album.id}`;
    } else {
      await tx`UPDATE albums SET id = ${album.to}, artist_id = ${artistIdFor(album.artist)} WHERE id = ${album.id}`;
    }
  }
  for (const track of plan) {
    if (track.to) await moveTrack(tx, track.id, track.to, artistIdFor(track.artist));
  }
  const left = await tx`SELECT 1 FROM tracks WHERE artist_id = '' UNION ALL SELECT 1 FROM albums WHERE artist_id = ''`;
  if (left.length === 0) {
    await tx`DELETE FROM artist_aliases WHERE artist_id = ''`;
    await tx`DELETE FROM artists WHERE id = ''`;
  }
});
console.log("\nDone.");
await sql.end();
