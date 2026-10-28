import { migrate } from "../lib/migrations";
import { createPostgres } from "../lib/postgres";

async function main() {
  const sql = createPostgres();
  try {
    const applied = await migrate(sql);
    console.log(applied.length > 0 ? `PostgreSQL: applied ${applied.join(", ")}` : "PostgreSQL schema is up to date");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
