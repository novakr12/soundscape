import { matchMissingTracks } from "../lib/deezer";
import { ImportError, importFromListenBrainz } from "../lib/listenbrainz";
import { sql } from "../lib/postgres";
import { userExists } from "../lib/users";

async function main() {
  const [userId, listenBrainzUser] = process.argv.slice(2);
  if (!userId || !listenBrainzUser) {
    console.error("Usage: npm run import:listenbrainz -- <username> <listenbrainz-username>");
    process.exit(1);
  }

  try {
    if (!(await userExists(userId))) throw new ImportError(`No account named ${userId}`);

    const result = await importFromListenBrainz(userId, listenBrainzUser);
    console.log(
      `Imported ${result.imported} listens from ListenBrainz user ${listenBrainzUser} into ${userId} ` +
        `(${result.skipped} skipped, ${result.catalogNodesCreated} new catalog nodes${result.truncated ? ", newest 5,000 only" : ""})`,
    );

    const deezer = await matchMissingTracks();
    console.log(
      deezer.unreachable
        ? "Deezer: unreachable, run npm run db:deezer later"
        : `Deezer: matched ${deezer.matched} of ${deezer.checked} new tracks`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof ImportError ? err.message : err);
  process.exit(1);
});
