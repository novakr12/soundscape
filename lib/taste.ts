import { sql } from "./postgres";

export type SharedArtist = { id: string; name: string };
export type TasteMatch = { score: number; sharedCount: number; sharedArtists: SharedArtist[] };

const SHOWN = 5;

async function artistPlays(userId: string) {
  const rows = await sql`
    SELECT a.id, a.name, sum(p.plays) AS plays
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ${userId}
    GROUP BY a.id`;
  return new Map(rows.map((row) => [row.id as string, { name: row.name as string, plays: row.plays as number }]));
}

type Plays = Map<string, { name: string; plays: number }>;

const total = (plays: Plays) => [...plays.values()].reduce((sum, a) => sum + a.plays, 0);

export function compareTaste(mine: Plays, theirs: Plays) {
  const [myTotal, theirTotal] = [total(mine), total(theirs)];
  let dot = 0;
  const shared: (SharedArtist & { weight: number })[] = [];
  for (const [id, artist] of mine) {
    const other = theirs.get(id);
    if (!other) continue;
    dot += Math.sqrt(artist.plays * other.plays);
    shared.push({ id, name: artist.name, weight: Math.min(artist.plays / myTotal, other.plays / theirTotal) });
  }
  return {
    score: Math.round((100 * dot) / Math.sqrt(myTotal * theirTotal)),
    shared: shared.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)),
  };
}

export async function tasteMatch(userId: string, otherId: string): Promise<TasteMatch | null> {
  const [mine, theirs] = await Promise.all([artistPlays(userId), artistPlays(otherId)]);
  if (mine.size === 0 || theirs.size === 0) return null;
  const { score, shared } = compareTaste(mine, theirs);

  return {
    score,
    sharedCount: shared.length,
    sharedArtists: shared.slice(0, SHOWN).map(({ id, name }) => ({ id, name })),
  };
}
