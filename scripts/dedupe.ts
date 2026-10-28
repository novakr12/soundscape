import { findDuplicatePlays, removeDuplicatePlays, usersWithPlays } from "../lib/dedupe";
import { sql } from "../lib/postgres";
import { formatDateTime } from "../lib/time";

const apply = process.argv.includes("--apply");
const EXAMPLES = 3;

async function main() {
  try {
    let total = 0;
    for (const userId of await usersWithPlays()) {
      const duplicates = await findDuplicatePlays(userId);
      if (duplicates.length === 0) continue;
      total += duplicates.length;
      console.log(`${userId}: ${duplicates.length} duplicate ${duplicates.length === 1 ? "play" : "plays"}`);
      for (const duplicate of duplicates.slice(0, EXAMPLES)) {
        const seconds = Math.round((duplicate.playedAt.getTime() - duplicate.keptAt.getTime()) / 1000);
        console.log(
          `  ${duplicate.artist} – ${duplicate.title}, ${formatDateTime(duplicate.playedAt)} (${seconds} s after the play that stays)`,
        );
      }
      if (apply) console.log(`  removed ${await removeDuplicatePlays(userId, duplicates)}`);
    }
    if (total === 0) console.log("No duplicate plays.");
    else if (!apply) console.log(`Run again with -- --apply to remove ${total} duplicate plays.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
