import { sql } from "./postgres";

const KEEP_DAYS = 30;
const MAX_MESSAGE = 1000;
const MAX_STACK = 4000;

export type ErrorGroup = {
  source: string;
  message: string;
  count: number;
  firstAt: Date;
  lastAt: Date;
  stack?: string;
  digest?: string;
};

export async function recordError(source: string, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_MESSAGE) || "Unknown error";
  const stack = error instanceof Error && error.stack ? error.stack.slice(0, MAX_STACK) : null;
  const digest =
    error && typeof error === "object" && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  try {
    await sql`
      INSERT INTO server_errors (source, message, stack, digest)
      VALUES (${source.slice(0, 300)}, ${message}, ${stack}, ${digest})`;
  } catch {}
}

export function requestSource(method: string, path: string) {
  return `${method} ${path.split("?")[0]}`;
}

export async function recentErrors(limit = 30): Promise<ErrorGroup[]> {
  const rows = await sql`
    SELECT DISTINCT ON (source, message) source, message, stack, digest,
           count(*) OVER (PARTITION BY source, message) AS count,
           min(at) OVER (PARTITION BY source, message) AS first_at,
           at AS last_at
    FROM server_errors
    ORDER BY source, message, at DESC`;
  return rows
    .map((row) => ({
      source: row.source as string,
      message: row.message as string,
      count: Number(row.count),
      firstAt: row.first_at as Date,
      lastAt: row.last_at as Date,
      ...(row.stack ? { stack: row.stack as string } : {}),
      ...(row.digest ? { digest: row.digest as string } : {}),
    }))
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, limit);
}

export async function errorsSince(since: Date): Promise<number> {
  const [row] = await sql`SELECT count(*) AS errors FROM server_errors WHERE at >= ${since}`;
  return Number(row.errors);
}

export async function clearErrors() {
  await sql`DELETE FROM server_errors`;
}

export async function removeOldErrors(now = new Date()) {
  await sql`DELETE FROM server_errors WHERE at < ${new Date(now.getTime() - KEEP_DAYS * 86_400_000)}`;
}
