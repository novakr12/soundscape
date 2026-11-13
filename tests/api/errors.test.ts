import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, describe, it } from "node:test";
import { errorsSince, recentErrors, recordError, removeOldErrors, requestSource } from "../../lib/errors";
import { runJob } from "../../lib/jobs";
import { deleteValues } from "../../lib/kv";
import { sql } from "../../lib/postgres";

const run = randomBytes(4).toString("hex");
const page = `GET /test-${run}`;
const job = `test-${run}-broken`;

after(async () => {
  await sql`DELETE FROM server_errors WHERE source IN (${page}, ${`job ${job}`}, ${`old ${run}`})`;
  await deleteValues(`job:${job}`);
  await sql.end();
});

describe("server errors", () => {
  it("leaves the query string out of the source", () => {
    assert.equal(requestSource("GET", "/1/validate-token?token=secret"), "GET /1/validate-token");
  });

  it("groups the same error from the same place", async () => {
    const since = new Date(Date.now() - 1000);
    for (let i = 0; i < 3; i++) {
      await recordError(page, Object.assign(new Error(`broken ${run}`), { digest: `digest-${i}` }));
    }
    await recordError(page, `plain text ${run}`);
    const mine = (await recentErrors(1000)).filter((group) => group.source === page);
    assert.deepEqual(mine.map((group) => [group.message, group.count]).sort(), [
      [`broken ${run}`, 3],
      [`plain text ${run}`, 1],
    ]);
    const broken = mine.find((group) => group.message === `broken ${run}`);
    assert.equal(broken?.digest, "digest-2");
    assert.match(broken?.stack ?? "", /broken/);
    assert.ok((await errorsSince(since)) >= 4);
  });

  it("records failed background job runs", async () => {
    await runJob(job, async () => {
      throw new Error(`job failed ${run}`);
    });
    const groups = await recentErrors(1000);
    assert.ok(groups.some((group) => group.source === `job ${job}` && group.message === `job failed ${run}`));
  });

  it("forgets errors after 30 days", async () => {
    await sql`INSERT INTO server_errors (at, source, message) VALUES (now() - interval '31 days', ${`old ${run}`}, 'old')`;
    await removeOldErrors();
    assert.equal((await sql`SELECT 1 FROM server_errors WHERE source = ${`old ${run}`}`).length, 0);
  });
});
