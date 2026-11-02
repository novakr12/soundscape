import { cache } from "react";
import type { ArtistLink } from "./artist-info";
import { sql } from "./postgres";
import { privateUsers } from "./privacy";

export type Artist = {
  artistId: string;
  name: string;
  photo?: string;
  genres: string[];
  plays: number;
  listeners: number;
  songs: number;
  facts: string[];
  bio?: string;
  bioUrl?: string;
  links: ArtistLink[];
  infoChecked: boolean;
};

type Facts = {
  type: string | null;
  area: string | null;
  began: string | null;
  ended: string | null;
  hasEnded: boolean;
};

function artistFacts({ type, area, began, ended, hasEnded }: Facts) {
  let years: string | null = null;
  if (hasEnded && began && ended) years = `${began}–${ended}`;
  else if (!hasEnded && began) years = type === "Person" ? `born ${began}` : `since ${began}`;
  return [type, area, years].filter((fact): fact is string => Boolean(fact));
}

export type ArtistSong = {
  trackId: string;
  title: string;
  cover?: string;
  plays: number;
  listeners: number;
};

export type SimilarArtist = {
  artistId: string;
  name: string;
  cover?: string;
  photo: boolean;
  listeners: number;
};

export const getArtist = cache(async (artistId: string): Promise<Artist | null> => {
  const [row] = await sql`
    SELECT a.name, a.photo, a.artist_type, a.area, a.began, a.ended, a.has_ended, a.bio, a.bio_url, a.links,
           a.info_checked_at IS NOT NULL AS info_checked,
           coalesce((SELECT array_agg(g.genre) FROM artist_genres g WHERE g.artist_id = a.id), '{}') AS genres,
           coalesce(sum(p.plays), 0) AS plays, count(DISTINCT p.user_id) AS listeners, count(DISTINCT p.track_id) AS songs
    FROM artists a
    LEFT JOIN tracks t ON t.artist_id = a.id
    LEFT JOIN user_track_plays p ON p.track_id = t.id
    WHERE a.id = ${artistId}
    GROUP BY a.id`;
  if (!row) return null;
  return {
    artistId,
    name: row.name,
    photo: row.photo ?? undefined,
    genres: [...(row.genres as string[])].sort(),
    plays: row.plays,
    listeners: row.listeners,
    songs: row.songs,
    facts: artistFacts({
      type: row.artist_type,
      area: row.area,
      began: row.began,
      ended: row.ended,
      hasEnded: row.has_ended,
    }),
    bio: row.bio ?? undefined,
    bioUrl: row.bio_url ?? undefined,
    links: row.links,
    infoChecked: row.info_checked,
  };
});

export async function getTopSongs(artistId: string, limit = 10): Promise<ArtistSong[]> {
  const rows = await sql`
    SELECT t.id, t.title, t.cover, sum(p.plays) AS plays, count(*) AS listeners
    FROM tracks t JOIN user_track_plays p ON p.track_id = t.id
    WHERE t.artist_id = ${artistId}
    GROUP BY t.id
    ORDER BY plays DESC, listeners DESC, t.title
    LIMIT ${limit}`;
  return rows.map((row) => ({
    trackId: row.id,
    title: row.title,
    cover: row.cover ?? undefined,
    plays: row.plays,
    listeners: row.listeners,
  }));
}

export async function getYourArtistPlays(userId: string, artistId: string): Promise<number> {
  const [row] = await sql`
    SELECT coalesce(sum(p.plays), 0) AS plays
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
    WHERE p.user_id = ${userId} AND t.artist_id = ${artistId}`;
  return row.plays;
}

export async function getSimilarArtists(artistId: string, limit = 6): Promise<SimilarArtist[]> {
  const listeners = (
    await sql`
      SELECT DISTINCT p.user_id FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
      WHERE t.artist_id = ${artistId}`
  ).map((row) => row.user_id as string);
  const hidden = await privateUsers(listeners);
  const visible = listeners.filter((userId) => !hidden.has(userId));
  if (visible.length === 0) return [];

  const rows = await sql`
    SELECT a.id, a.name, a.photo,
           (array_agg(t.cover ORDER BY p.plays DESC, t.id) FILTER (WHERE t.cover IS NOT NULL))[1] AS cover,
           count(DISTINCT p.user_id) AS listeners, sum(p.plays) AS plays
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ANY(${visible}) AND a.id <> ${artistId}
    GROUP BY a.id
    ORDER BY listeners DESC, plays DESC, a.name
    LIMIT ${limit}`;
  return rows.map((row) => ({
    artistId: row.id,
    name: row.name,
    cover: row.photo ?? row.cover ?? undefined,
    photo: Boolean(row.photo),
    listeners: row.listeners,
  }));
}
