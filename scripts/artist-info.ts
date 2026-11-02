import { fillArtistInfo } from "../lib/artist-info";
import { sql } from "../lib/postgres";

async function main() {
  let checked = 0;
  let withBio = 0;
  try {
    for (;;) {
      const summary = await fillArtistInfo({ limit: 25 });
      checked += summary.checked;
      withBio += summary.withBio;
      if (summary.unreachable) {
        console.warn("MusicBrainz or Wikipedia is unreachable, stopped. Run npm run db:artist-info later to continue.");
        break;
      }
      if (summary.checked === 0) break;
      console.log(`Artist info: ${checked} artists checked, ${withBio} with a bio so far`);
    }
    console.log(`Artist info: ${checked} artists checked, ${withBio} with a bio`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
