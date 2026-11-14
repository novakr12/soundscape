import { resolveTracks } from "./aliases";
import { songArtist, songTitle } from "./catalog";
import { saveTracks } from "./imports";
import { sendLoveToLastfm } from "./lastfm-scrobble";
import { sql } from "./postgres";

const MAX_TEXT = 300;

export type LovedSong = { trackId: string; title: string; artist: string; cover?: string; lovedAt: string };

export async function isLoved(userId: string, trackId: string) {
  const [row] = await sql`SELECT 1 FROM loved_tracks WHERE user_id = ${userId} AND track_id = ${trackId}`;
  return Boolean(row);
}

export async function setLoved(userId: string, trackId: string, loved: boolean): Promise<boolean> {
  const [track] = await sql`
    SELECT t.title, a.name AS artist FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE t.id = ${trackId}`;
  if (!track) return false;
  if (loved) {
    await sql`INSERT INTO loved_tracks (user_id, track_id) VALUES (${userId}, ${trackId}) ON CONFLICT DO NOTHING`;
  } else {
    await sql`DELETE FROM loved_tracks WHERE user_id = ${userId} AND track_id = ${trackId}`;
  }
  await sendLoveToLastfm(userId, track.artist, track.title, loved).catch(() => {});
  return true;
}

export async function songId(artist: string, title: string): Promise<string | null> {
  const [cleanArtist, cleanTitle] = [artist.trim().slice(0, MAX_TEXT), title.trim().slice(0, MAX_TEXT)];
  if (!cleanArtist || !cleanTitle) return null;
  const [{ trackId }] = await resolveTracks([{ artist: cleanArtist, title: cleanTitle }]);
  return (await sql`SELECT 1 FROM tracks WHERE id = ${trackId}`).length > 0 ? trackId : null;
}

export async function loveSong(userId: string, artist: string, title: string, loved: boolean): Promise<string | null> {
  const [cleanArtist, cleanTitle] = [artist.trim().slice(0, MAX_TEXT), title.trim().slice(0, MAX_TEXT)];
  if (!cleanArtist || !cleanTitle) return null;
  const [{ trackId, artistId }] = await resolveTracks([{ artist: cleanArtist, title: cleanTitle }]);
  if (loved) {
    await saveTracks([{ trackId, artistId, title: songTitle(cleanTitle), artist: songArtist(cleanArtist) }]);
  }
  return (await setLoved(userId, trackId, loved)) || !loved ? trackId : null;
}

export async function lovedSongs(userId: string, limit = 10): Promise<LovedSong[]> {
  const rows = await sql`
    SELECT l.track_id, t.title, a.name AS artist, t.cover, l.loved_at
    FROM loved_tracks l JOIN tracks t ON t.id = l.track_id JOIN artists a ON a.id = t.artist_id
    WHERE l.user_id = ${userId}
    ORDER BY l.loved_at DESC
    LIMIT ${limit}`;
  return rows.map((row) => ({
    trackId: row.track_id,
    title: row.title,
    artist: row.artist,
    ...(row.cover ? { cover: row.cover } : {}),
    lovedAt: new Date(row.loved_at).toISOString(),
  }));
}
