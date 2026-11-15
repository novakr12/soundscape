import { sql } from "./postgres";
import { TIME_ZONE } from "./time";

export async function userMonths(userId: string): Promise<string[]> {
  const rows = await sql`
    WITH bounds AS (
      SELECT min(played_at) AS first, max(played_at) AS last FROM plays WHERE user_id = ${userId}
    )
    SELECT to_char(month, 'YYYY-MM') AS month
    FROM bounds,
      generate_series(
        date_trunc('month', bounds.first AT TIME ZONE ${TIME_ZONE}),
        bounds.last AT TIME ZONE ${TIME_ZONE},
        interval '1 month'
      ) AS month
    WHERE EXISTS (
      SELECT 1 FROM plays p
      WHERE p.user_id = ${userId}
        AND p.played_at >= month AT TIME ZONE ${TIME_ZONE}
        AND p.played_at < (month + interval '1 month') AT TIME ZONE ${TIME_ZONE}
    )
    ORDER BY month`;
  return rows.map((row) => row.month as string);
}
