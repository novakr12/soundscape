import type { TransactionSql } from "postgres";
import { artistIdFor, slug, songTitle } from "./catalog";
import { sql } from "./postgres";

const MAX_NAME = 300;

export class LibraryEditError extends Error {}

type Tx = TransactionSql;

function cleanName(text: string) {
  const name = text.replace(/\s+/g, " ").trim();
  if (!name) throw new LibraryEditError("The name can't be empty.");
  if (name.length > MAX_NAME) throw new LibraryEditError(`Keep the name under ${MAX_NAME} characters.`);
  return name;
}

async function moveTrack(tx: Tx, fromId: string, intoId: string, artistId: string, title?: string) {
  if (fromId === intoId) return;
  await tx`
    INSERT INTO tracks (id, title, artist_id, album_id, album_source, track_number, duration_ms, mbid, cover,
                        deezer_id, deezer_missing, deezer_album_missing, navidrome_cover, navidrome_user,
                        navidrome_checked_at, cover_art_checked_at, cover_art_release_group, apple_preview,
                        apple_checked_at)
    SELECT ${intoId}, coalesce(${title ?? null}, title), ${artistId}, album_id, album_source, track_number,
           duration_ms, mbid, cover, deezer_id, deezer_missing, deezer_album_missing, navidrome_cover,
           navidrome_user, navidrome_checked_at, cover_art_checked_at, cover_art_release_group, apple_preview,
           apple_checked_at
    FROM tracks WHERE id = ${fromId}
    ON CONFLICT (id) DO NOTHING`;
  await tx`
    UPDATE tracks target SET
      cover = coalesce(target.cover, other.cover),
      deezer_id = coalesce(target.deezer_id, other.deezer_id),
      duration_ms = coalesce(target.duration_ms, other.duration_ms),
      mbid = coalesce(target.mbid, other.mbid),
      album_id = coalesce(target.album_id, other.album_id),
      album_source = CASE WHEN target.album_id IS NULL THEN other.album_source ELSE target.album_source END,
      track_number = CASE WHEN target.album_id IS NULL THEN other.track_number ELSE target.track_number END
    FROM tracks other
    WHERE target.id = ${intoId} AND other.id = ${fromId}`;
  await tx`UPDATE plays SET track_id = ${intoId} WHERE track_id = ${fromId}`;
  await tx`
    UPDATE wanted w SET track_id = ${intoId}
    WHERE w.track_id = ${fromId}
      AND NOT EXISTS (SELECT 1 FROM wanted o WHERE o.user_id = w.user_id AND o.track_id = ${intoId})`;
  await tx`DELETE FROM wanted WHERE track_id = ${fromId}`;
  await tx`UPDATE track_aliases SET track_id = ${intoId} WHERE track_id = ${fromId}`;
  await tx`DELETE FROM cover_cache WHERE track_id = ${fromId}`;
  await tx`DELETE FROM tracks WHERE id = ${fromId}`;
  await tx`
    INSERT INTO track_aliases (alias, track_id) VALUES (${fromId}, ${intoId})
    ON CONFLICT (alias) DO UPDATE SET track_id = excluded.track_id`;
  await tx`DELETE FROM track_aliases WHERE alias = ${intoId}`;
}

async function moveArtist(tx: Tx, fromId: string, intoId: string, name: string) {
  await tx`
    INSERT INTO artists (id, name, mbid, genres_checked_at, photo, deezer_artist_id, photo_checked_at, artist_type,
                         area, began, ended, has_ended, bio, bio_url, links, info_checked_at)
    SELECT ${intoId}, ${name}, mbid, genres_checked_at, photo, deezer_artist_id, photo_checked_at, artist_type,
           area, began, ended, has_ended, bio, bio_url, links, info_checked_at
    FROM artists WHERE id = ${fromId}
    ON CONFLICT (id) DO NOTHING`;
  await tx`
    UPDATE artists target SET
      mbid = coalesce(target.mbid, other.mbid),
      photo = coalesce(target.photo, other.photo)
    FROM artists other
    WHERE target.id = ${intoId} AND other.id = ${fromId}`;
  await tx`
    INSERT INTO artist_genres (artist_id, genre)
    SELECT ${intoId}, genre FROM artist_genres WHERE artist_id = ${fromId}
    ON CONFLICT DO NOTHING`;

  for (const album of await tx`SELECT id FROM albums WHERE artist_id = ${fromId}`) {
    const oldId: string = album.id;
    const newId = oldId.startsWith(`${fromId}-`) ? `${intoId}${oldId.slice(fromId.length)}` : oldId;
    await tx`
      INSERT INTO albums (id, title, artist_id, deezer_album_id, tracklist, tracklist_checked_at)
      SELECT ${newId}, title, ${intoId}, deezer_album_id, tracklist, tracklist_checked_at FROM albums WHERE id = ${oldId}
      ON CONFLICT (id) DO NOTHING`;
    if (newId !== oldId) {
      await tx`UPDATE tracks SET album_id = ${newId} WHERE album_id = ${oldId}`;
      await tx`DELETE FROM albums WHERE id = ${oldId}`;
    } else {
      await tx`UPDATE albums SET artist_id = ${intoId} WHERE id = ${oldId}`;
    }
  }

  for (const track of await tx`SELECT id, title FROM tracks WHERE artist_id = ${fromId}`) {
    const id: string = track.id;
    const newId = id.startsWith(`${fromId}-`)
      ? `${intoId}${id.slice(fromId.length)}`
      : `${intoId}-${slug(songTitle(track.title))}`;
    await moveTrack(tx, id, newId, intoId);
  }

  await tx`UPDATE artist_aliases SET artist_id = ${intoId} WHERE artist_id = ${fromId}`;
  await tx`
    INSERT INTO artist_aliases (alias, artist_id) VALUES (${fromId}, ${intoId})
    ON CONFLICT (alias) DO UPDATE SET artist_id = excluded.artist_id`;
  await tx`DELETE FROM artist_aliases WHERE alias = ${intoId}`;
  await tx`DELETE FROM artists WHERE id = ${fromId}`;
}

async function artistExists(id: string) {
  return (await sql`SELECT 1 FROM artists WHERE id = ${id}`).length > 0;
}

export async function renameArtist(artistId: string, newName: string): Promise<string> {
  const name = cleanName(newName);
  const newId = artistIdFor(name);
  if (!newId) throw new LibraryEditError("That name has no letters or digits.");
  if (!(await artistExists(artistId))) throw new LibraryEditError("That artist doesn't exist any more.");
  if (newId === artistId) {
    await sql`UPDATE artists SET name = ${name} WHERE id = ${artistId}`;
    return artistId;
  }
  if (await artistExists(newId)) {
    throw new LibraryEditError(`There is already an artist called ${name}. Merge into it instead.`);
  }
  await sql.begin((tx) => moveArtist(tx, artistId, newId, name));
  return newId;
}

export async function mergeArtist(artistId: string, into: string): Promise<string> {
  const target = cleanName(into);
  const [row] = await sql`
    SELECT a.id, a.name FROM artists a
    WHERE a.id = ${artistIdFor(target)} OR a.id = ${target}
       OR a.id = (SELECT artist_id FROM artist_aliases WHERE alias = ${artistIdFor(target)})
    LIMIT 1`;
  if (!row) throw new LibraryEditError(`There is no artist called ${target}.`);
  if (row.id === artistId) throw new LibraryEditError("That's the same artist.");
  if (!(await artistExists(artistId))) throw new LibraryEditError("That artist doesn't exist any more.");
  await sql.begin((tx) => moveArtist(tx, artistId, row.id, row.name));
  return row.id;
}

export async function renameSong(trackId: string, newTitle: string): Promise<string> {
  const title = cleanName(newTitle);
  const [track] = await sql`SELECT artist_id FROM tracks WHERE id = ${trackId}`;
  if (!track) throw new LibraryEditError("That song doesn't exist any more.");
  const titleSlug = slug(songTitle(title));
  if (!titleSlug) throw new LibraryEditError("That title has no letters or digits.");
  const newId = `${track.artist_id}-${titleSlug}`;
  if (newId === trackId) {
    await sql`UPDATE tracks SET title = ${title} WHERE id = ${trackId}`;
    return trackId;
  }
  if ((await sql`SELECT 1 FROM tracks WHERE id = ${newId}`).length > 0) {
    throw new LibraryEditError(`This artist already has a song called ${title}. Merge into it instead.`);
  }
  await sql.begin((tx) => moveTrack(tx, trackId, newId, track.artist_id, title));
  return newId;
}

export async function mergeSong(trackId: string, intoId: string): Promise<string> {
  if (trackId === intoId) throw new LibraryEditError("That's the same song.");
  const [from] = await sql`SELECT artist_id FROM tracks WHERE id = ${trackId}`;
  const [into] = await sql`SELECT artist_id FROM tracks WHERE id = ${intoId}`;
  if (!from || !into) throw new LibraryEditError("One of those songs doesn't exist any more.");
  await sql.begin((tx) => moveTrack(tx, trackId, intoId, into.artist_id));
  return intoId;
}

export async function otherSongsBy(trackId: string) {
  const rows = await sql`
    SELECT t.id, t.title FROM tracks t
    WHERE t.artist_id = (SELECT artist_id FROM tracks WHERE id = ${trackId}) AND t.id <> ${trackId}
    ORDER BY t.title`;
  return rows.map((row) => ({ trackId: row.id as string, title: row.title as string }));
}
