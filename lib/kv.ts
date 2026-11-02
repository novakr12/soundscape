import type { JSONValue } from "postgres";
import { sql } from "./postgres";

export const keys = {
  loginFailures: (username: string) => `login:fail:${username}`,
  importLock: (userId: string) => `import:lock:${userId}`,
  coverProgress: (userId: string) => `covers:progress:${userId}`,
  lastfmProgress: (userId: string) => `lastfm:progress:${userId}`,
  listeningRecord: (userId: string) => `record:${userId}`,
  yearscape: (userId: string, year: number) => `yearscape:${userId}:${year}`,
  lastBackup: "backup:last",
};

const expiry = (seconds?: number) => (seconds === undefined ? null : new Date(Date.now() + seconds * 1000));

export async function getValue<T>(key: string): Promise<T | null> {
  const [row] = await sql`SELECT value FROM kv WHERE key = ${key} AND (expires_at IS NULL OR expires_at > now())`;
  return row ? (row.value as T) : null;
}

export async function setValue(key: string, value: unknown, seconds?: number) {
  await sql`
    INSERT INTO kv (key, value, expires_at) VALUES (${key}, ${sql.json(value as JSONValue)}, ${expiry(seconds)})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`;
}

export async function deleteValues(...names: string[]) {
  if (names.length > 0) await sql`DELETE FROM kv WHERE key = ANY(${names})`;
}

export async function deleteValuesStartingWith(prefix: string) {
  await sql`DELETE FROM kv WHERE starts_with(key, ${prefix})`;
}

export async function takeLock(key: string, seconds: number): Promise<boolean> {
  const taken = await sql`
    INSERT INTO kv (key, value, expires_at) VALUES (${key}, 'true', ${expiry(seconds)})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
    WHERE kv.expires_at IS NOT NULL AND kv.expires_at <= now()
    RETURNING key`;
  return taken.length > 0;
}

export async function extendValue(key: string, seconds: number) {
  await sql`UPDATE kv SET expires_at = ${expiry(seconds)} WHERE key = ${key}`;
}

export async function increment(key: string, seconds: number): Promise<number> {
  const [row] = await sql`
    INSERT INTO kv (key, value, expires_at) VALUES (${key}, '1', ${expiry(seconds)})
    ON CONFLICT (key) DO UPDATE SET
      value = CASE WHEN kv.expires_at <= now() THEN '1'::jsonb ELSE to_jsonb((kv.value #>> '{}')::int + 1) END,
      expires_at = CASE WHEN kv.expires_at <= now() THEN excluded.expires_at ELSE kv.expires_at END
    RETURNING value`;
  return Number(row.value);
}

export async function removeExpired() {
  await sql`DELETE FROM kv WHERE expires_at <= now()`;
  await sql`DELETE FROM listening WHERE expires_at <= now()`;
  await sql`DELETE FROM cover_cache WHERE expires_at <= now()`;
  await sql`DELETE FROM sessions WHERE expires_at <= now()`;
}

const CLEAN_EVERY_MS = 10 * 60 * 1000;
const globalForCleanup = globalThis as unknown as { kvCleanup?: boolean };

export function startCleanup() {
  if (globalForCleanup.kvCleanup) return;
  globalForCleanup.kvCleanup = true;
  setInterval(() => {
    removeExpired().catch((error) =>
      console.warn(`Cleanup: ${error instanceof Error ? error.message : String(error)}`),
    );
  }, CLEAN_EVERY_MS);
}
