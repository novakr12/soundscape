import { fillAlbumsFromDeezer } from "../lib/deezer";
import { albumsFromListenBrainz, listenBrainzAccounts } from "../lib/listenbrainz";
import { sql } from "../lib/postgres";

async function fromListenBrainz() {
  for (const { userId, listenBrainzUser } of await listenBrainzAccounts()) {
    try {
      const { listens, linked } = await albumsFromListenBrainz(listenBrainzUser);
      console.log(`ListenBrainz: ${linked} albums from ${listens} listens by ${listenBrainzUser} (${userId})`);
    } catch (err) {
      console.warn(
        `ListenBrainz: skipped ${listenBrainzUser} (${userId}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

async function fromDeezer() {
  let checked = 0;
  let linked = 0;
  for (;;) {
    const summary = await fillAlbumsFromDeezer(100);
    checked += summary.checked;
    linked += summary.linked;
    if (summary.unreachable) {
      console.warn("Deezer is unreachable, stopped. Run npm run db:albums later to continue.");
      break;
    }
    if (summary.checked === 0) break;
    console.log(`Deezer: ${linked} albums found in ${checked} songs so far`);
  }
  console.log(
    `Deezer: found ${linked} albums for ${checked} songs. Songs without a Deezer match get theirs from npm run db:deezer.`,
  );
}

async function main() {
  try {
    await fromListenBrainz();
    await fromDeezer();
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
