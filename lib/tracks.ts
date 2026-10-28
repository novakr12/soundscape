import { cache } from "react";
import { sql } from "./postgres";
import { privateUsers } from "./privacy";
import type { DailyPlays } from "./stats";
import { addDays, localDay, startOfDay } from "./time";

export type Track = {
  trackId: string;
  title: string;
  artist: string;
  artistId: string;
  cover?: string;
  durationMs?: number;
  plays: number;
  listeners: number;
};

export type RelatedTrack = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  listeners: number;
};

export const getTrack = cache(async (trackId: string): Promise<Track | null> => {
  const [row] = await sql`
    SELECT t.title, a.name AS artist, a.id AS artist_id, t.cover, t.duration_ms,
           coalesce(sum(p.plays), 0) AS plays, count(p.user_id) AS listeners
    FROM tracks t JOIN artists a ON a.id = t.artist_id
    LEFT JOIN user_track_plays p ON p.track_id = t.id
    WHERE t.id = ${trackId}
    GROUP BY t.id, a.id`;
  if (!row) return null;
  return {
    trackId,
    title: row.title,
    artist: row.artist,
    artistId: row.artist_id,
    cover: row.cover ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    plays: row.plays,
    listeners: row.listeners,
  };
});

export async function getYourPlays(userId: string, trackId: string): Promise<number> {
  const [row] = await sql`SELECT plays FROM user_track_plays WHERE user_id = ${userId} AND track_id = ${trackId}`;
  return row?.plays ?? 0;
}

export async function getTrackPlaysPerDay(trackId: string, days = 30, now = new Date()): Promise<DailyPlays[]> {
  const dayList = Array.from({ length: days }, (_, i) => addDays(localDay(now), i - days + 1));
  const rows = await sql`
    SELECT played_at FROM plays
    WHERE track_id = ${trackId} AND played_at >= ${startOfDay(dayList[0])} AND played_at < ${startOfDay(addDays(dayList.at(-1)!, 1))}`;
  const counts = new Map(dayList.map((day) => [day, 0]));
  for (const row of rows) {
    const day = localDay(row.played_at);
    if (counts.has(day)) counts.set(day, counts.get(day)! + 1);
  }
  return dayList.map((day) => ({ day, plays: counts.get(day)! }));
}

export async function existingIds(trackIds: string[], artistIds: string[]) {
  const [tracks, artists] = await Promise.all([
    sql`SELECT id FROM tracks WHERE id = ANY(${trackIds})`,
    sql`SELECT id FROM artists WHERE id = ANY(${artistIds})`,
  ]);
  return {
    tracks: new Set<string>(tracks.map((row) => row.id)),
    artists: new Set<string>(artists.map((row) => row.id)),
  };
}

export async function getAlsoPlayed(trackId: string, limit = 8): Promise<RelatedTrack[]> {
  const listeners = (await sql`SELECT user_id FROM user_track_plays WHERE track_id = ${trackId}`).map(
    (row) => row.user_id as string,
  );
  const hidden = await privateUsers(listeners);
  const visible = listeners.filter((userId) => !hidden.has(userId));
  if (visible.length === 0) return [];

  const rows = await sql`
    SELECT t.id, t.title, a.name AS artist, t.cover, count(*) AS listeners, sum(p.plays) AS plays
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ANY(${visible}) AND p.track_id <> ${trackId}
    GROUP BY t.id, a.id
    ORDER BY listeners DESC, plays DESC, t.title
    LIMIT ${limit}`;
  return rows.map((row) => ({
    trackId: row.id,
    title: row.title,
    artist: row.artist,
    cover: row.cover ?? undefined,
    listeners: row.listeners,
  }));
}
