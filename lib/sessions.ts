import { createHash, randomBytes } from "node:crypto";
import { sql } from "./postgres";

export const SESSION_DAYS = 30;
const REFRESH_AFTER_MS = 60 * 60 * 1000;

const hash = (token: string) => createHash("sha256").update(token).digest("base64url");
const expiry = (from = Date.now()) => new Date(from + SESSION_DAYS * 24 * 60 * 60 * 1000);

export async function startSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${hash(token)}, ${userId}, ${expiry()})`;
  return token;
}

export async function sessionUser(token: string | undefined, now = Date.now()): Promise<string | null> {
  if (!token) return null;
  const [row] =
    await sql`SELECT user_id, last_seen_at FROM sessions WHERE id = ${hash(token)} AND expires_at > ${new Date(now)}`;
  if (!row) return null;
  if (now - row.last_seen_at.getTime() > REFRESH_AFTER_MS) {
    await sql`UPDATE sessions SET last_seen_at = ${new Date(now)}, expires_at = ${expiry(now)} WHERE id = ${hash(token)}`;
  }
  return row.user_id;
}

export async function endSession(token: string | undefined) {
  if (token) await sql`DELETE FROM sessions WHERE id = ${hash(token)}`;
}

export async function endOtherSessions(userId: string, keep: string | undefined) {
  await sql`DELETE FROM sessions WHERE user_id = ${userId} AND id <> ${keep ? hash(keep) : ""}`;
}
