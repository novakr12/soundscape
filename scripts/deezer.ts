import { matchMissingTracks } from "../lib/deezer";
import { sql } from "../lib/postgres";

async function main() {
  try {
    const summary = await matchMissingTracks(500);
    if (summary.unreachable) {
      console.warn("Deezer: unreachable, skipped. Run npm run db:deezer later.");
    } else if (summary.checked === 0) {
      console.log("Deezer: every track already has a Deezer id");
    } else {
      console.log(`Deezer: matched ${summary.matched} of ${summary.checked} tracks without an id`);
      if (summary.missing.length > 0) {
        const shown = summary.missing.slice(0, 5).join(", ");
        const more = summary.missing.length > 5 ? ` and ${summary.missing.length - 5} more` : "";
        console.log(`Deezer: no match for ${shown}${more}`);
      }
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
