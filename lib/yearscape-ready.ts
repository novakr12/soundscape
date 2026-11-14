import { localDay } from "./time";
import { getYearscape } from "./yearscape";

export type YearscapeReady =
  | { ready: false }
  | {
      ready: true;
      year: number;
      plays: number;
      listeningMs: number;
      topArtist?: string;
      topSong?: { title: string; artist: string };
      newArtists: number;
      url: string;
    };

export function readyYear(now = new Date()): number | null {
  const [year, month] = localDay(now).split("-").map(Number);
  if (month === 12) return year;
  if (month === 1) return year - 1;
  return null;
}

export async function yearscapeReady(userId: string, now = new Date()): Promise<YearscapeReady> {
  const year = readyYear(now);
  if (year === null) return { ready: false };
  const scape = await getYearscape(userId, year, now);
  if (scape.plays === 0) return { ready: false };
  const [artist] = scape.topArtists;
  const [song] = scape.topSongs;
  return {
    ready: true,
    year,
    plays: scape.plays,
    listeningMs: Math.round(scape.listeningMs),
    ...(artist ? { topArtist: artist.name } : {}),
    ...(song ? { topSong: { title: song.title, artist: song.artist } } : {}),
    newArtists: scape.newArtists.length,
    url: `/yearscape?year=${year}`,
  };
}
