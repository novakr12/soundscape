import { fillArtistPhotos } from "../lib/artist-photos";
import { sql } from "../lib/postgres";

async function main() {
  let checked = 0;
  let found = 0;
  try {
    for (;;) {
      const summary = await fillArtistPhotos({ limit: 50 });
      checked += summary.checked;
      found += summary.found;
      if (summary.unreachable) {
        console.warn("Deezer is unreachable, stopped. Run npm run db:photos later to continue.");
        break;
      }
      if (summary.checked === 0) break;
      console.log(`Artist photos: found for ${found} of ${checked} artists so far`);
    }
    console.log(`Artist photos: found for ${found} of ${checked} artists`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
