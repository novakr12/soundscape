import { fillCoversFromCoverArtArchive } from "../lib/coverartarchive";
import { sql } from "../lib/postgres";

async function main() {
  let checked = 0;
  let found = 0;
  try {
    for (;;) {
      const summary = await fillCoversFromCoverArtArchive({ limit: 50 });
      checked += summary.checked;
      found += summary.found;
      if (summary.unreachable) {
        console.warn("Cover Art Archive: MusicBrainz is unreachable, stopped. Run npm run db:covers later.");
        break;
      }
      if (summary.checked === 0) break;
      console.log(`Cover Art Archive: ${found} covers found in ${checked} songs so far`);
    }
    console.log(`Cover Art Archive: found ${found} covers for ${checked} songs Deezer could not match`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
