import { trackIdFor } from "./catalog";
import type { Listen } from "./imports";
import { deletePlay } from "./play-edits";
import { sql } from "./postgres";

export const SAME_PLAY_MS = 60 * 1000;

export type DuplicatePlay = {
  playId: string;
  playedAt: Date;
  keptAt: Date;
  trackId: string;
  title: string;
  artist: string;
};

export async function usersWithPlays(): Promise<string[]> {
  const rows = await sql`SELECT DISTINCT user_id FROM user_track_plays ORDER BY user_id`;
  return rows.map((row) => row.user_id as string);
}

export async function findDuplicatePlays(userId: string): Promise<DuplicatePlay[]> {
  const rows = await sql`
    SELECT p.id, p.played_at, p.track_id, t.title, a.name AS artist
    FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ${userId}
    ORDER BY p.track_id, p.played_at, p.id`;

  const duplicates: DuplicatePlay[] = [];
  let kept = rows[0];
  for (const play of rows.slice(1)) {
    if (play.track_id === kept.track_id && play.played_at.getTime() - kept.played_at.getTime() <= SAME_PLAY_MS) {
      duplicates.push({
        playId: play.id,
        playedAt: play.played_at,
        keptAt: kept.played_at,
        trackId: play.track_id,
        title: play.title,
        artist: play.artist,
      });
    } else {
      kept = play;
    }
  }
  return duplicates.sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
}

export async function removeDuplicatePlays(userId: string, duplicates: DuplicatePlay[]): Promise<number> {
  let removed = 0;
  for (const duplicate of duplicates) {
    if (await deletePlay(userId, { playId: duplicate.playId, playedAt: duplicate.playedAt })) removed++;
  }
  return removed;
}

export async function withoutKnownPlays(userId: string, listens: Listen[]): Promise<Listen[]> {
  const times = listens.map((listen) => listen.playedAt.getTime()).filter((time) => !Number.isNaN(time));
  if (times.length === 0) return listens;
  const from = new Date(Math.min(...times) - SAME_PLAY_MS);
  const to = new Date(Math.max(...times) + SAME_PLAY_MS);

  const known = new Map<string, number[]>();
  const rows = await sql`
    SELECT played_at, track_id FROM plays
    WHERE user_id = ${userId} AND played_at >= ${from} AND played_at <= ${to}`;
  for (const row of rows) {
    known.set(row.track_id, [...(known.get(row.track_id) ?? []), row.played_at.getTime()]);
  }
  return listens.filter((listen) => {
    const trackId = trackIdFor(listen.artist, listen.title);
    const plays = known.get(trackId) ?? [];
    if (plays.some((time) => Math.abs(time - listen.playedAt.getTime()) <= SAME_PLAY_MS)) return false;
    known.set(trackId, [...plays, listen.playedAt.getTime()]);
    return true;
  });
}
