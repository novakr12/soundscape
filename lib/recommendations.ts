import { sql } from "./postgres";

export type Recommendation = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  score: number;
  via: string[];
};

export type SimilarListener = {
  userId: string;
  shared: number;
};

export async function getRecommendations(userId: string, limit = 10): Promise<Recommendation[]> {
  const rows = await sql`
    WITH mine AS (
      SELECT track_id FROM user_track_plays WHERE user_id = ${userId}
    ), others AS (
      SELECT p.user_id, count(*) AS overlap
      FROM user_track_plays p JOIN mine m ON m.track_id = p.track_id
      WHERE p.user_id <> ${userId}
      GROUP BY p.user_id
    )
    SELECT t.id, t.title, a.name AS artist, t.cover,
           sum(o.overlap * p.plays) AS score, array_agg(DISTINCT o.user_id) AS via
    FROM others o JOIN user_track_plays p ON p.user_id = o.user_id
    JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE NOT EXISTS (SELECT 1 FROM mine m WHERE m.track_id = p.track_id)
    GROUP BY t.id, a.id
    ORDER BY score DESC, t.title
    LIMIT ${limit}`;

  return rows.map((row) => ({
    trackId: row.id,
    title: row.title,
    artist: row.artist,
    cover: row.cover ?? undefined,
    score: Number(row.score),
    via: row.via,
  }));
}

export async function getSimilarListeners(userId: string, limit = 5): Promise<SimilarListener[]> {
  const rows = await sql`
    SELECT p.user_id, count(*) AS shared
    FROM user_track_plays p
    JOIN user_track_plays mine ON mine.track_id = p.track_id AND mine.user_id = ${userId}
    WHERE p.user_id <> ${userId}
    GROUP BY p.user_id
    ORDER BY shared DESC, p.user_id
    LIMIT ${limit}`;

  return rows.map((row) => ({ userId: row.user_id, shared: row.shared }));
}

export function because(via: string[], hidden: Set<string>) {
  const names = via.filter((userId) => !hidden.has(userId));
  const others = via.length - names.length;
  const parts = [...names];
  if (others === 1) parts.push(names.length > 0 ? "a similar listener" : "A similar listener");
  if (others > 1) parts.push(`${others} similar listeners`);
  return `${parts.join(", ").replace(/, ([^,]*)$/, " and $1")} played it`;
}
