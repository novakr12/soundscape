import { sql } from "./postgres";

export async function isPrivate(userId: string): Promise<boolean> {
  const [row] = await sql`SELECT is_private FROM users WHERE username = ${userId}`;
  return row?.is_private === true;
}

export async function setPrivate(userId: string, value: boolean) {
  await sql`UPDATE users SET is_private = ${value} WHERE username = ${userId}`;
}

export async function privateUsers(userIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Set();
  const rows = await sql`SELECT username FROM users WHERE username = ANY(${unique}) AND is_private`;
  return new Set(rows.map((row) => row.username as string));
}
