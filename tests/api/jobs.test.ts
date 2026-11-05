import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getJobStatus } from "../../lib/admin";
import { importListens } from "../../lib/imports";
import { lastRun, runJob } from "../../lib/jobs";
import { deleteValues } from "../../lib/kv";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const names = ["ok", "unreachable", "broken", "plain"].map((name) => `test-${user.run}-${name}`);

before(async () => {
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: "Waiting", playedAt: new Date(Date.now() - 60_000) },
  ]);
});

after(async () => {
  await deleteValues(...names.map((name) => `job:${name}`));
  await removeTestUser(user);
  await closeConnections();
});

describe("background jobs", () => {
  it("remembers what the last run did", async () => {
    const before = Date.now();
    await runJob(names[0], async () => ({ checked: 25, found: 20, unreachable: false }));
    const run = await lastRun(names[0]);
    assert.equal(run?.checked, 25);
    assert.equal(run?.found, 20);
    assert.ok(run && run.at >= before && run.ms >= 0);
  });

  it("remembers when a service was unreachable or the job failed", async () => {
    await runJob(names[1], async () => ({
      checked: 0,
      found: 0,
      unreachable: true,
      reason: "musicbrainz.org is unreachable",
    }));
    const stopped = await lastRun(names[1]);
    assert.equal(stopped?.unreachable, true);
    assert.equal(stopped?.reason, "musicbrainz.org is unreachable");
    await runJob(names[2], async () => {
      throw new Error("database went away");
    });
    assert.equal((await lastRun(names[2]))?.error, "database went away");
  });

  it("records jobs that report nothing", async () => {
    await runJob(names[3], async () => undefined);
    const run = await lastRun(names[3]);
    assert.equal(run?.checked, undefined);
    assert.ok(run?.at);
  });

  it("counts the artists still waiting for genres, photos and info", async () => {
    const { jobs } = await getJobStatus();
    const waiting = Object.fromEntries(jobs.map((job) => [job.name, job.waiting]));
    assert.ok((waiting.genres ?? 0) >= 1);
    assert.ok((waiting["artist-photos"] ?? 0) >= 1);
    assert.equal(waiting.cleanup, undefined);
  });
});
