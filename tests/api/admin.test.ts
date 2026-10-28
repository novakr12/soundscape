import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { admins, getAccounts, getLastBackup, getLibraryStatus, isAdmin } from "../../lib/admin";
import { importListens } from "../../lib/imports";
import { deleteValues, getValue, keys, setValue } from "../../lib/kv";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const savedAdmins = process.env.ADMIN_USERS;
const savedBackup = { value: null as string | null };

before(async () => {
  savedBackup.value = await getValue<string>(keys.lastBackup);
  await createTestUser(user.userId);
  await importListens(user.userId, [
    { artist: user.artist, title: "One", playedAt: new Date(Date.now() - 120_000) },
    { artist: user.artist, title: "Two", playedAt: new Date(Date.now() - 60_000) },
  ]);
});

afterEach(() => {
  process.env.ADMIN_USERS = savedAdmins;
});

after(async () => {
  if (savedBackup.value) await setValue(keys.lastBackup, savedBackup.value);
  else await deleteValues(keys.lastBackup);
  await removeTestUser(user);
  await closeConnections();
});

describe("admin", () => {
  it("only treats the listed usernames as admins", () => {
    process.env.ADMIN_USERS = " Admin , friend ,";
    assert.deepEqual(admins(), ["admin", "friend"]);
    assert.equal(isAdmin("admin"), true);
    assert.equal(isAdmin("someone"), false);
    assert.equal(isAdmin(null), false);
    delete process.env.ADMIN_USERS;
    assert.equal(isAdmin("admin"), false);
  });

  it("lists accounts with their plays and last play", async () => {
    const account = (await getAccounts()).find((a) => a.username === user.userId);
    assert.equal(account?.plays, 2);
    assert.equal(account?.lastPlay?.title, "Two");
    assert.equal(account?.private, false);
    assert.ok(account?.createdAt instanceof Date);
  });

  it("counts the library", async () => {
    const status = await getLibraryStatus();
    assert.ok(status.songs >= 2 && status.plays >= 2 && status.artists >= 1);
    assert.ok(status.withCover <= status.songs && status.withAlbum <= status.songs);
  });

  it("reads the last backup that backup.sh recorded", async () => {
    await setValue(keys.lastBackup, "2026-10-27T04:12:00Z|soundscape-2026-10-27_041200.tar.gz|12M");
    assert.deepEqual(await getLastBackup(), {
      at: new Date("2026-10-27T04:12:00Z"),
      file: "soundscape-2026-10-27_041200.tar.gz",
      size: "12M",
    });
    await setValue(keys.lastBackup, "garbage");
    assert.equal(await getLastBackup(), null);
  });
});
