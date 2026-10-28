import { sql } from "./postgres";
import { compareTaste } from "./taste";
import { startOfDay } from "./time";
import { getYearscape, type Yearscape } from "./yearscape";

const SHARED_SHOWN = 10;
const ONLY_SHOWN = 5;

export type ComparedArtist = { artistId: string; name: string; photo?: string; mine: number; theirs: number };
export type ComparedSong = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  mine: number;
  theirs: number;
};

export type YearComparison = {
  year: number;
  years: number[];
  mine: Yearscape;
  theirs: Yearscape;
  score: number | null;
  sharedArtistCount: number;
  sharedArtists: ComparedArtist[];
  onlyMine: ComparedArtist[];
  onlyTheirs: ComparedArtist[];
  sharedSongs: ComparedSong[];
};

function byShare<T extends { mine: number; theirs: number }>(items: T[], myTotal: number, theirTotal: number) {
  const weight = (item: T) => Math.min(item.mine / myTotal, item.theirs / theirTotal);
  return items.sort((a, b) => weight(b) - weight(a) || b.mine + b.theirs - (a.mine + a.theirs));
}

export async function compareYears(userId: string, otherId: string, year: number, now = new Date()) {
  const from = startOfDay(`${year}-01-01`);
  const to = startOfDay(`${year + 1}-01-01`);
  const [mine, theirs, artistRows, songRows] = await Promise.all([
    getYearscape(userId, year, now),
    getYearscape(otherId, year, now),
    sql`
      SELECT p.user_id, a.id, a.name, a.photo, count(*) AS plays
      FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
      WHERE p.user_id IN (${userId}, ${otherId}) AND p.played_at >= ${from} AND p.played_at < ${to}
      GROUP BY p.user_id, a.id`,
    sql`
      SELECT t.id, t.title, a.name AS artist, t.cover,
             count(*) FILTER (WHERE p.user_id = ${userId}) AS mine,
             count(*) FILTER (WHERE p.user_id = ${otherId}) AS theirs
      FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
      WHERE p.user_id IN (${userId}, ${otherId}) AND p.played_at >= ${from} AND p.played_at < ${to}
      GROUP BY t.id, a.id
      HAVING count(*) FILTER (WHERE p.user_id = ${userId}) > 0 AND count(*) FILTER (WHERE p.user_id = ${otherId}) > 0`,
  ]);

  const artists = new Map<string, ComparedArtist>();
  for (const row of artistRows) {
    const artist = artists.get(row.id) ?? {
      artistId: row.id,
      name: row.name,
      ...(row.photo ? { photo: row.photo } : {}),
      mine: 0,
      theirs: 0,
    };
    if (row.user_id === userId) artist.mine = row.plays;
    else artist.theirs = row.plays;
    artists.set(row.id, artist);
  }
  const all = [...artists.values()];
  const plays = (key: "mine" | "theirs") =>
    new Map(all.filter((a) => a[key] > 0).map((a) => [a.artistId, { name: a.name, plays: a[key] }]));
  const [myPlays, theirPlays] = [plays("mine"), plays("theirs")];
  const shared = all.filter((a) => a.mine > 0 && a.theirs > 0);
  const only = (key: "mine" | "theirs", other: "mine" | "theirs") =>
    all
      .filter((a) => a[key] > 0 && a[other] === 0)
      .sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name))
      .slice(0, ONLY_SHOWN);

  const comparison: YearComparison = {
    year,
    years: [...new Set([...mine.years, ...theirs.years])].sort((a, b) => b - a),
    mine,
    theirs,
    score: myPlays.size > 0 && theirPlays.size > 0 ? compareTaste(myPlays, theirPlays).score : null,
    sharedArtistCount: shared.length,
    sharedArtists: byShare(shared, mine.plays, theirs.plays).slice(0, SHARED_SHOWN),
    onlyMine: only("mine", "theirs"),
    onlyTheirs: only("theirs", "mine"),
    sharedSongs: byShare(
      songRows.map((row) => ({
        trackId: row.id as string,
        title: row.title as string,
        artist: row.artist as string,
        ...(row.cover ? { cover: row.cover as string } : {}),
        mine: row.mine as number,
        theirs: row.theirs as number,
      })),
      mine.plays,
      theirs.plays,
    ).slice(0, SHARED_SHOWN),
  };
  return comparison;
}
