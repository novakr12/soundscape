import { fillGenres } from "../lib/genres";
import { sql } from "../lib/postgres";

async function main() {
  let checked = 0;
  let found = 0;
  try {
    for (;;) {
      const summary = await fillGenres({ limit: 25 });
      checked += summary.checked;
      found += summary.found;
      if (summary.unreachable) {
        console.warn("MusicBrainz is unreachable, stopped. Run npm run db:genres later to continue.");
        break;
      }
      if (summary.checked === 0) break;
      console.log(`Genres: found for ${found} of ${checked} artists so far`);
    }
    console.log(`Genres: found for ${found} of ${checked} artists`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
