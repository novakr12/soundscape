import { readFileSync } from "node:fs";
import { importListens, type Listen } from "../lib/imports";
import { sql } from "../lib/postgres";
import { userExists } from "../lib/users";

type JsonListen = {
  artist: string;
  title: string;
  playedAt: string;
  mbid?: string;
  album?: string;
};

async function main() {
  const [userId, file] = process.argv.slice(2);
  if (!userId || !file) {
    console.error("Usage: npm run import:json -- <username> <file.json>");
    process.exit(1);
  }

  try {
    if (!(await userExists(userId))) throw new Error(`No account named ${userId}`);

    const rows = JSON.parse(readFileSync(file, "utf8")) as JsonListen[];
    const listens: Listen[] = rows.map((row) => ({
      artist: String(row.artist ?? ""),
      title: String(row.title ?? ""),
      playedAt: new Date(row.playedAt),
      mbid: row.mbid,
      album: typeof row.album === "string" ? row.album : undefined,
    }));

    const result = await importListens(userId, listens);
    console.log(
      `Imported ${result.imported} listens for ${userId} (${result.skipped} skipped, ${result.catalogNodesCreated} new catalog nodes)`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
