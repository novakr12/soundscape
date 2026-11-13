import { createHash, randomUUID } from "node:crypto";
import { sql } from "./postgres";

export const MAX_TOKENS = 20;
const MAX_NAME = 60;
const MAX_AGENT = 200;

export class TokenError extends Error {}

export type DeviceToken = {
  id: number;
  name: string;
  hint: string;
  createdAt: Date;
  lastUsedAt?: Date;
  lastUsedBy?: string;
};

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createToken(userId: string, name: string): Promise<string> {
  const label = name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  if (!label) throw new TokenError("Give the token a name, for example the app or device that will use it.");
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM api_tokens WHERE user_id = ${userId}`;
  if (count >= MAX_TOKENS) throw new TokenError(`You can have at most ${MAX_TOKENS} tokens. Revoke one you don't use.`);
  const token = randomUUID();
  await sql`
    INSERT INTO api_tokens (token, user_id, name, hint)
    VALUES (${hash(token)}, ${userId}, ${label}, ${token.slice(-4)})`;
  return token;
}

export async function listTokens(userId: string): Promise<DeviceToken[]> {
  const rows = await sql`
    SELECT id, name, hint, created_at, last_used_at, last_used_by FROM api_tokens
    WHERE user_id = ${userId}
    ORDER BY created_at DESC, id DESC`;
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name as string,
    hint: row.hint as string,
    createdAt: row.created_at as Date,
    ...(row.last_used_at ? { lastUsedAt: row.last_used_at as Date } : {}),
    ...(row.last_used_by ? { lastUsedBy: row.last_used_by as string } : {}),
  }));
}

export async function revokeToken(userId: string, id: number) {
  const rows = await sql`DELETE FROM api_tokens WHERE user_id = ${userId} AND id = ${id} RETURNING 1`;
  return rows.length > 0;
}

export async function userForAuthorization(header: string | null, userAgent?: string | null): Promise<string | null> {
  const match = header?.match(/^token\s+(\S+)$/i);
  if (!match) return null;
  const [row] = await sql`
    UPDATE api_tokens SET last_used_at = now(), last_used_by = ${userAgent?.trim().slice(0, MAX_AGENT) || null}
    WHERE token = ${hash(match[1])}
    RETURNING user_id`;
  return row?.user_id ?? null;
}
