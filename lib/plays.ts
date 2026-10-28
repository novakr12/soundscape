import { randomUUID } from "node:crypto";
import { deleteValues, keys } from "./kv";
import { publishPlay, setListening } from "./live";
import { sql } from "./postgres";

export type Play = {
  playId: string;
  userId: string;
  trackId: string;
  title: string;
  artist: string;
  playedAt: string;
  count: number;
};

export async function recordPlay(userId: string, trackId: string): Promise<Play | null> {
  const [found] = await sql`
    SELECT t.title, a.name AS artist, t.cover
    FROM tracks t JOIN artists a ON a.id = t.artist_id
    WHERE t.id = ${trackId}`;
  if (!found) return null;

  const title: string = found.title;
  const artist: string = found.artist;
  const cover: string | undefined = found.cover ?? undefined;
  const playedAt = new Date();
  const playId = randomUUID();

  const [counted] = await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO plays (id, user_id, track_id, played_at) VALUES (${playId}, ${userId}, ${trackId}, ${playedAt})`;
    return transaction`SELECT plays FROM user_track_plays WHERE user_id = ${userId} AND track_id = ${trackId}`;
  });

  const track = { trackId, title, artist, cover };
  await Promise.all([setListening(userId, track), deleteValues(keys.listeningRecord(userId))]);
  await publishPlay({ userId, ...track, playedAt: playedAt.toISOString() });

  return {
    playId,
    userId,
    ...track,
    playedAt: playedAt.toISOString(),
    count: counted.plays,
  };
}
