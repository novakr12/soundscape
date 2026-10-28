import { randomBytes } from "node:crypto";
import { sql } from "./postgres";

export type SignupMode = "open" | "invite" | "closed";

export const INVITE_DAYS = 7;
const INVITE_MS = INVITE_DAYS * 24 * 60 * 60 * 1000;

export function signupMode(): SignupMode {
  const mode = (process.env.SIGNUPS ?? "open").trim().toLowerCase();
  return mode === "invite" || mode === "closed" ? mode : "open";
}

export async function createInvite(userId: string): Promise<string> {
  const code = randomBytes(12).toString("base64url");
  await sql`DELETE FROM invites WHERE expires_at < now() - interval '30 days'`;
  await sql`
    INSERT INTO invites (code, created_by, expires_at)
    VALUES (${code}, ${userId}, ${new Date(Date.now() + INVITE_MS)})`;
  return code;
}

export async function inviteUsable(code: string): Promise<boolean> {
  if (!code) return false;
  const [row] = await sql`SELECT 1 FROM invites WHERE code = ${code} AND used_by IS NULL AND expires_at > now()`;
  return Boolean(row);
}

export async function claimInvite(code: string, username: string): Promise<boolean> {
  if (!code) return false;
  const claimed = await sql`
    UPDATE invites SET used_by = ${username}
    WHERE code = ${code} AND used_by IS NULL AND expires_at > now()
    RETURNING code`;
  return claimed.length > 0;
}

export async function releaseInvite(code: string, username: string) {
  await sql`UPDATE invites SET used_by = NULL WHERE code = ${code} AND used_by = ${username}`;
}
