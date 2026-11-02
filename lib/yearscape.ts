import { albumsFor, type TopAlbum } from "./albums";
import { artistIdFor } from "./catalog";
import { shiftMonth } from "./history";
import { getValue, keys, setValue } from "./kv";
import { userMonths as playMonths } from "./months";
import { sql } from "./postgres";
import { addDays, localDay, startOfDay } from "./time";

const DEFAULT_SONG_MS = 210_000;
const CACHE_SECONDS = 24 * 60 * 60;
const TOP = 5;

export type YearSong = { trackId: string; title: string; artist: string; cover?: string; plays: number };
export type YearArtist = { name: string; plays: number; cover?: string; photo?: boolean };
export type YearMonth = { month: string; plays: number; topSong?: YearSong; topArtist?: YearArtist };

type Summary = {
  plays: number;
  listeningMs: number;
  artists: number;
  songs: number;
  topSongs: YearSong[];
  topArtists: YearArtist[];
  topGenres: { name: string; plays: number }[];
  topAlbums: TopAlbum[];
  busiestDay?: { day: string; plays: number };
  longestStreak?: { days: number; from: string; to: string };
  newArtists: { name: string; month: string }[];
};

export type Yearscape = Summary & { year: number; years: number[]; months: YearMonth[] };

export type Monthscape = Summary & {
  month: string;
  previous?: string;
  next?: string;
  days: { day: string; plays: number }[];
};

type Play = { playedAt: Date; day: string; trackId: string; title: string; artist: string };

function top<T extends { plays: number }>(items: Iterable<T>, limit = TOP) {
  return [...items].sort((a, b) => b.plays - a.plays).slice(0, limit);
}

function countSongs(plays: Play[]) {
  const songs = new Map<string, YearSong>();
  for (const play of plays) {
    const song = songs.get(play.trackId) ?? { trackId: play.trackId, title: play.title, artist: play.artist, plays: 0 };
    song.plays++;
    songs.set(play.trackId, song);
  }
  return songs;
}

function countArtists(plays: Play[]) {
  const artists = new Map<string, YearArtist>();
  for (const play of plays) {
    const key = artistIdFor(play.artist);
    const artist = artists.get(key) ?? { name: play.artist, plays: 0 };
    artist.plays++;
    artists.set(key, artist);
  }
  return artists;
}

function longestStreak(days: string[]) {
  let best: Summary["longestStreak"];
  let start = days[0];
  for (let i = 0; i < days.length; i++) {
    if (i > 0 && addDays(days[i - 1], 1) !== days[i]) start = days[i];
    const length = (new Date(days[i]).getTime() - new Date(start).getTime()) / 86_400_000 + 1;
    if (!best || length > best.days) best = { days: length, from: start, to: days[i] };
  }
  return best;
}

async function readPeriod(userId: string, first: string, last: string, prefix: string) {
  const from = startOfDay(`${first}-01`);
  const to = startOfDay(`${shiftMonth(last, 1)}-01`);
  const [rows, earlier] = await Promise.all([
    sql`
      SELECT p.played_at, p.track_id, t.title, a.name AS artist
      FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
      WHERE p.user_id = ${userId} AND p.played_at >= ${from} AND p.played_at < ${to}
      ORDER BY p.played_at, p.id`,
    sql`
      SELECT DISTINCT a.name
      FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
      WHERE p.user_id = ${userId} AND p.played_at < ${from}`,
  ]);
  const plays: Play[] = rows
    .map((row) => ({
      playedAt: row.played_at as Date,
      day: localDay(row.played_at),
      trackId: row.track_id as string,
      title: row.title as string,
      artist: row.artist as string,
    }))
    .filter((play) => play.day.startsWith(prefix));
  return { plays, earlierArtists: new Set(earlier.map((row) => artistIdFor(row.name))) };
}

async function summarize(plays: Play[], earlierArtists: Set<string>): Promise<Summary> {
  const songs = countSongs(plays);
  const rows = await sql`SELECT id, duration_ms, cover FROM tracks WHERE id = ANY(${[...songs.keys()]})`;
  const details = new Map(
    rows.map((row) => [row.id as string, { ms: row.duration_ms as number | null, cover: row.cover as string | null }]),
  );
  const known = plays.filter((play) => details.get(play.trackId)?.ms);
  const knownMs = known.reduce((sum, play) => sum + details.get(play.trackId)!.ms!, 0);
  const average = known.length > 0 ? knownMs / known.length : DEFAULT_SONG_MS;
  const withCover = (song: YearSong) => ({ ...song, cover: details.get(song.trackId)?.cover ?? undefined });
  const songsByPlays = top(songs.values(), songs.size);
  const artistPlays = new Map<string, number>();
  for (const play of plays)
    artistPlays.set(artistIdFor(play.artist), (artistPlays.get(artistIdFor(play.artist)) ?? 0) + 1);
  const photoRows =
    await sql`SELECT id, photo FROM artists WHERE id = ANY(${[...artistPlays.keys()]}) AND photo IS NOT NULL`;
  const photos = new Map(photoRows.map((row) => [row.id as string, row.photo as string]));
  const artistCover = (artist: YearArtist) => {
    const photo = photos.get(artistIdFor(artist.name));
    if (photo) return { ...artist, cover: photo, photo: true };
    return {
      ...artist,
      cover:
        songsByPlays
          .map((song) =>
            artistIdFor(song.artist) === artistIdFor(artist.name) ? details.get(song.trackId)?.cover : null,
          )
          .find(Boolean) ?? undefined,
    };
  };
  const genreRows =
    await sql`SELECT artist_id, genre FROM artist_genres WHERE artist_id = ANY(${[...artistPlays.keys()]})`;
  const genrePlays = new Map<string, number>();
  for (const row of genreRows) {
    genrePlays.set(row.genre, (genrePlays.get(row.genre) ?? 0) + (artistPlays.get(row.artist_id) ?? 0));
  }
  const topGenres = [...genrePlays]
    .map(([name, count]) => ({ name, plays: count }))
    .sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name))
    .slice(0, TOP);

  const albums = await albumsFor([...songs.keys()]);
  const albumPlays = new Map<string, TopAlbum>();
  for (const song of songsByPlays) {
    const album = albums.get(song.trackId);
    if (!album) continue;
    const entry = albumPlays.get(album.albumId) ?? { ...album, artist: song.artist, plays: 0 };
    entry.plays += song.plays;
    entry.cover ??= details.get(song.trackId)?.cover ?? undefined;
    albumPlays.set(album.albumId, entry);
  }
  const topAlbums = [...albumPlays.values()]
    .sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title))
    .slice(0, TOP);

  const playsByDay = new Map<string, number>();
  for (const play of plays) playsByDay.set(play.day, (playsByDay.get(play.day) ?? 0) + 1);
  const busiest = top(
    [...playsByDay].map(([day, count]) => ({ day, plays: count })),
    1,
  )[0];

  const newArtists = new Map<string, { name: string; month: string }>();
  for (const play of plays) {
    const key = artistIdFor(play.artist);
    if (earlierArtists.has(key) || newArtists.has(key)) continue;
    newArtists.set(key, { name: play.artist, month: play.day.slice(0, 7) });
  }

  return {
    plays: plays.length,
    listeningMs: knownMs + (plays.length - known.length) * average,
    artists: countArtists(plays).size,
    songs: songs.size,
    topSongs: top(songs.values()).map(withCover),
    topArtists: top(countArtists(plays).values()).map(artistCover),
    topGenres,
    topAlbums,
    busiestDay: busiest,
    longestStreak: longestStreak([...playsByDay.keys()].sort()),
    newArtists: [...newArtists.values()],
  };
}

async function fingerprint(userId: string, year: number) {
  const from = startOfDay(`${year}-01-01`);
  const [row] = await sql`
    SELECT count(*) FILTER (WHERE played_at >= ${from}) AS plays,
           coalesce(sum(hashtext(track_id || ' ' || played_at::text)) FILTER (WHERE played_at >= ${from}), 0) AS hash,
           count(*) FILTER (WHERE played_at < ${from}) AS earlier
    FROM plays
    WHERE user_id = ${userId} AND played_at < ${startOfDay(`${year + 1}-01-01`)}`;
  return `${row.plays}:${row.hash}:${row.earlier}`;
}

export async function getYearscape(userId: string, year: number, now = new Date()): Promise<Yearscape> {
  const months = await playMonths(userId);
  const years = [...new Set([Number(localDay(now).slice(0, 4)), ...months.map((m) => Number(m.slice(0, 4)))])].sort(
    (a, b) => b - a,
  );
  const past = year < Number(localDay(now).slice(0, 4));
  const key = keys.yearscape(userId, year);
  const print = past ? await fingerprint(userId, year) : "";
  if (past) {
    const cached = await getValue<{ print: string; scape: Omit<Yearscape, "years"> }>(key);
    if (cached?.print === print) return { ...cached.scape, years };
  }
  const { plays, earlierArtists } = await readPeriod(userId, `${year}-01`, `${year}-12`, `${year}-`);

  const scape: Omit<Yearscape, "years"> = {
    year,
    ...(await summarize(plays, earlierArtists)),
    months: Array.from({ length: 12 }, (_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, "0")}`;
      const monthPlays = plays.filter((play) => play.day.startsWith(month));
      return {
        month,
        plays: monthPlays.length,
        topSong: top(countSongs(monthPlays).values(), 1)[0],
        topArtist: top(countArtists(monthPlays).values(), 1)[0],
      };
    }),
  };
  if (past) await setValue(key, { print, scape }, CACHE_SECONDS);
  return { ...scape, years };
}

export async function getMonthscape(userId: string, month: string, now = new Date()): Promise<Monthscape> {
  const months = await playMonths(userId);
  const { plays, earlierArtists } = await readPeriod(userId, month, month, month);
  const summary = await summarize(plays, earlierArtists);

  const playsByDay = new Map<string, number>();
  for (const play of plays) playsByDay.set(play.day, (playsByDay.get(play.day) ?? 0) + 1);
  const days: Monthscape["days"] = [];
  for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1)) {
    days.push({ day, plays: playsByDay.get(day) ?? 0 });
  }

  return {
    month,
    ...summary,
    previous: months.length > 0 && month > months[0] ? shiftMonth(month, -1) : undefined,
    next: month < localDay(now).slice(0, 7) ? shiftMonth(month, 1) : undefined,
    days,
  };
}
