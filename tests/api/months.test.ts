import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { importListens } from "../../lib/imports";
import { userMonths } from "../../lib/months";
import { deleteAllPlays } from "../../lib/play-edits";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const { artist } = user;
const listen = (title: string, playedAt: string) => ({ artist, title, playedAt: new Date(playedAt) });

before(async () => {
  await createTestUser(user.userId);
  await importListens(user.userId, [
    listen("One", "2025-11-03T10:00:00Z"),
    listen("Two", "2025-11-20T10:00:00Z"),
    listen("Three", "2026-01-05T10:00:00Z"),
  ]);
});

after(async () => {
  await removeTestUser(user);
  await closeConnections();
});

describe("months with plays", () => {
  it("lists every month a play comes in", async () => {
    assert.deepEqual(await userMonths(user.userId), ["2025-11", "2026-01"]);
  });

  it("counts months in local time", async () => {
    await importListens(user.userId, [listen("New Year", "2025-12-31T23:30:00Z")]);
    assert.deepEqual(await userMonths(user.userId), ["2025-11", "2026-01"]);
    await importListens(user.userId, [listen("Late", "2025-12-31T22:30:00Z")]);
    assert.deepEqual(await userMonths(user.userId), ["2025-11", "2025-12", "2026-01"]);
  });

  it("forgets them when all plays are deleted", async () => {
    await deleteAllPlays(user.userId);
    assert.deepEqual(await userMonths(user.userId), []);
  });
});
