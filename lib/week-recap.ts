import { visibleFollowing } from "./feed";
import { ranking } from "./leaderboard";
import { sql } from "./postgres";
import { addDays, daysThisWeek, startOfDay } from "./time";

const SHOWN_ON_DAYS = 2;

export type WeekRecap = {
  from: string;
  to: string;
  plays: number;
  playsBefore: number;
  listeningMs: number;
  topSong?: { trackId: string; title: string; artist: string; cover?: string; plays: number };
  topArtist?: { artistId: string; name: string; photo?: string; plays: number };
  newArtists: number;
  place?: { rank: number; of: number };
};

export function showWeekRecap(now = new Date()) {
  return daysThisWeek(now).length <= SHOWN_ON_DAYS;
}

export async function lastWeekRecap(userId: string, now = new Date()): Promise<WeekRecap | null> {
  const monday = addDays(daysThisWeek(now)[0], -7);
  const from = startOfDay(monday);
  const to = startOfDay(addDays(monday, 7));
  const following = await visibleFollowing(userId);
  const [rows, [song], [artist], [counts]] = await Promise.all([
    ranking([userId, ...following], from, to),
    sql`
      SELECT p.track_id, t.title, a.name AS artist, t.cover, count(*) AS plays
      FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
      WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to}
      GROUP BY p.track_id, t.id, a.id
      ORDER BY plays DESC, min(p.played_at)
      LIMIT 1`,
    sql`
      SELECT a.id, a.name, a.photo, count(*) AS plays
      FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
      WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to}
      GROUP BY a.id
      ORDER BY plays DESC, min(p.played_at)
      LIMIT 1`,
    sql`
      SELECT
        (SELECT count(*) FROM plays
         WHERE user_id = ${userId} AND played_at >= ${startOfDay(addDays(monday, -7))} AND played_at < ${from}) AS before,
        (SELECT count(*) FROM (
           SELECT t.artist_id FROM plays p JOIN tracks t ON t.id = p.track_id
           WHERE p.user_id = ${userId} AND p.played_at < ${to}
           GROUP BY t.artist_id
           HAVING min(p.played_at) >= ${from}
         ) first_heard) AS new_artists`,
  ]);
  const mine = rows.find((row) => row.userId === userId);
  if (!mine || mine.plays === 0) return null;
  const listeners = rows.filter((row) => row.plays > 0);

  return {
    from: monday,
    to: addDays(monday, 6),
    plays: mine.plays,
    playsBefore: counts.before,
    listeningMs: mine.listeningMs,
    topSong: song && {
      trackId: song.track_id,
      title: song.title,
      artist: song.artist,
      ...(song.cover ? { cover: song.cover } : {}),
      plays: song.plays,
    },
    topArtist: artist && {
      artistId: artist.id,
      name: artist.name,
      ...(artist.photo ? { photo: artist.photo } : {}),
      plays: artist.plays,
    },
    newArtists: counts.new_artists,
    place: following.length > 0 ? { rank: listeners.indexOf(mine) + 1, of: listeners.length } : undefined,
  };
}
