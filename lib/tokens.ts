import { randomUUID } from "node:crypto";
import { sql } from "./postgres";

export async function getToken(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT token FROM api_tokens WHERE user_id = ${userId}`;
  return row?.token ?? null;
}

export async function rotateToken(userId: string): Promise<string> {
  const token = randomUUID();
  await sql`
    INSERT INTO api_tokens (token, user_id) VALUES (${token}, ${userId})
    ON CONFLICT (user_id) DO UPDATE SET token = excluded.token, created_at = now()`;
  return token;
}

export async function userForAuthorization(header: string | null): Promise<string | null> {
  const match = header?.match(/^token\s+(\S+)$/i);
  if (!match) return null;
  const [row] = await sql`SELECT user_id FROM api_tokens WHERE token = ${match[1]}`;
  return row?.user_id ?? null;
}
