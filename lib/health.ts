import type { Sql } from "postgres";
import { sql as postgres } from "./postgres";

export const HEALTH_TIMEOUT_MS = 2000;

export type ServiceHealth = { ok: boolean; ms: number };
export type Health = { ok: boolean; postgres: ServiceHealth };

async function timed(check: () => Promise<unknown>, timeoutMs: number): Promise<ServiceHealth> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), timeoutMs);
      }),
    ]);
    return { ok: true, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHealth({
  sql = postgres,
  timeoutMs = HEALTH_TIMEOUT_MS,
}: {
  sql?: Sql;
  timeoutMs?: number;
} = {}): Promise<Health> {
  const postgresHealth = await timed(() => sql`SELECT 1`, timeoutMs);
  return { ok: postgresHealth.ok, postgres: postgresHealth };
}
