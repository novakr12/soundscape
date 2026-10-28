import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "postgres";

const MIGRATION_FILE = /^(\d{3})_[a-z0-9_]+\.sql$/;

export async function migrate(sql: Sql, folder = join(process.cwd(), "postgres")): Promise<string[]> {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const done = new Set((await sql`SELECT version FROM schema_migrations`).map((row) => row.version as string));
  const files = readdirSync(folder)
    .filter((file) => MIGRATION_FILE.test(file))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (done.has(version)) continue;
    await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(4206917)`;
      const [already] = await transaction`SELECT 1 FROM schema_migrations WHERE version = ${version}`;
      if (already) return;
      await transaction.unsafe(readFileSync(join(folder, file), "utf8"));
      await transaction`INSERT INTO schema_migrations (version) VALUES (${version})`;
      applied.push(version);
    });
  }
  return applied;
}
