import { sql } from "./postgres";
import { TIME_ZONE } from "./time";

export async function userMonths(userId: string): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT to_char(played_at AT TIME ZONE ${TIME_ZONE}, 'YYYY-MM') AS month
    FROM plays WHERE user_id = ${userId}
    ORDER BY month`;
  return rows.map((row) => row.month as string);
}
