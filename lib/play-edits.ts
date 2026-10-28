import { type ImportResult, importListens } from "./imports";
import { deleteValues, keys } from "./kv";
import { sql } from "./postgres";

export const MAX_PLAYS_PER_DELETE = 1000;

export type PlayKey = { playId: string; playedAt: Date };

type StoredPlay = {
  trackId: string;
  playedAt: Date;
  playId: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deletePlay(userId: string, key: PlayKey): Promise<StoredPlay | null> {
  if (!UUID.test(key.playId) || Number.isNaN(key.playedAt.getTime())) return null;
  const [row] = await sql`
    DELETE FROM plays WHERE id = ${key.playId} AND user_id = ${userId} AND played_at = ${key.playedAt}
    RETURNING track_id, played_at`;
  if (!row) return null;
  const play: StoredPlay = { trackId: row.track_id, playedAt: row.played_at, playId: key.playId };

  await deleteValues(keys.listeningRecord(userId));
  return play;
}

export async function deletePlays(userId: string, plays: PlayKey[]): Promise<number> {
  let deleted = 0;
  for (const play of plays.slice(0, MAX_PLAYS_PER_DELETE)) {
    if (await deletePlay(userId, play)) deleted++;
  }
  return deleted;
}

export async function deleteAllPlays(userId: string): Promise<number> {
  const plays = await sql.begin(async (transaction) => {
    await transaction`DELETE FROM user_track_plays WHERE user_id = ${userId}`;
    const deleted = await transaction`DELETE FROM plays WHERE user_id = ${userId} RETURNING track_id, played_at`;
    await transaction`DELETE FROM import_state WHERE user_id = ${userId}`;
    return deleted.map((row) => ({ trackId: row.track_id as string, playedAt: row.played_at as Date }));
  });

  await deleteValues(keys.listeningRecord(userId));
  return plays.length;
}

export async function editPlay(
  userId: string,
  key: PlayKey,
  artist: string,
  title: string,
): Promise<ImportResult | null> {
  const play = await deletePlay(userId, key);
  if (!play) return null;
  return importListens(userId, [{ artist, title, playedAt: play.playedAt }]);
}
