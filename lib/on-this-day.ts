import { sql } from "./postgres";
import { addDays, localDay, startOfDay } from "./time";

const YEARS_BACK = 10;
const SONGS = 3;

export type ThatDaySong = { trackId: string; title: string; artist: string; plays: number };
export type ThatDay = { year: number; yearsAgo: number; plays: number; songs: ThatDaySong[] };

function sameDay(year: number, today: string) {
  const day = `${year}${today.slice(4)}`;
  return addDays(day, 0) === day ? day : null;
}

async function playsOn(userId: string, day: string) {
  return sql`
    SELECT p.played_at, p.track_id, t.title AS track_title, a.name AS artist_name
    FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ${userId} AND p.played_at >= ${startOfDay(day)} AND p.played_at < ${startOfDay(addDays(day, 1))}`;
}

export async function onThisDay(userId: string, now = new Date()): Promise<ThatDay[]> {
  const today = localDay(now);
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from({ length: YEARS_BACK }, (_, i) => thisYear - i - 1);

  const days = await Promise.all(
    years.map(async (year): Promise<ThatDay | null> => {
      const day = sameDay(year, today);
      if (!day) return null;
      const rows = await playsOn(userId, day);
      if (rows.length === 0) return null;
      const songs = new Map<string, ThatDaySong & { first: number }>();
      for (const row of rows) {
        const song = songs.get(row.track_id) ?? {
          trackId: row.track_id,
          title: row.track_title,
          artist: row.artist_name,
          plays: 0,
          first: row.played_at.getTime(),
        };
        song.plays++;
        song.first = Math.min(song.first, row.played_at.getTime());
        songs.set(row.track_id, song);
      }
      return {
        year,
        yearsAgo: thisYear - year,
        plays: rows.length,
        songs: [...songs.values()]
          .sort((a, b) => b.plays - a.plays || a.first - b.first)
          .slice(0, SONGS)
          .map(({ trackId, title, artist, plays }) => ({ trackId, title, artist, plays })),
      };
    }),
  );
  return days.filter((day): day is ThatDay => day !== null);
}
