import { forgetNavidromeCovers } from "./covers";
import { removeJellyfin } from "./jellyfin";
import { deleteValues, deleteValuesStartingWith, keys } from "./kv";
import { deleteAllPlays } from "./play-edits";
import { sql } from "./postgres";
import { removeRelay } from "./relay";

export async function deleteAccount(userId: string): Promise<number> {
  const plays = await deleteAllPlays(userId);
  await removeJellyfin(userId);
  await forgetNavidromeCovers(userId);
  await removeRelay(userId);
  await sql`DELETE FROM users WHERE username = ${userId}`;
  await deleteValues(
    keys.loginFailures(userId),
    keys.importLock(userId),
    keys.coverProgress(userId),
    keys.lastfmProgress(userId),
    keys.listeningRecord(userId),
  );
  await deleteValuesStartingWith(`yearscape:${userId}:`);
  return plays;
}
