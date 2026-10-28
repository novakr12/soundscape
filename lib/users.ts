import bcrypt from "bcryptjs";
import { sql } from "./postgres";

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 8;

export async function createUser(username: string, password: string): Promise<boolean> {
  const passwordHash = await bcrypt.hash(password, 10);
  const created = await sql`
    INSERT INTO users (username, password_hash) VALUES (${username}, ${passwordHash})
    ON CONFLICT (username) DO NOTHING
    RETURNING username`;
  return created.length > 0;
}

export async function verifyPassword(username: string, password: string): Promise<boolean> {
  const [row] = await sql`SELECT password_hash FROM users WHERE username = ${username}`;
  return row ? bcrypt.compare(password, row.password_hash) : false;
}

export async function changePassword(username: string, password: string, now = new Date()) {
  const passwordHash = await bcrypt.hash(password, 10);
  await sql`UPDATE users SET password_hash = ${passwordHash}, password_changed_at = ${now} WHERE username = ${username}`;
}

export async function userExists(username: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM users WHERE username = ${username}`;
  return Boolean(row);
}
