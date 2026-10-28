import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { endOtherSessions, sessionUser, startSession } from "../../lib/sessions";
import { changePassword, userExists, verifyPassword } from "../../lib/users";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();

before(async () => {
  await createTestUser(user.userId);
});

after(async () => {
  await removeTestUser(user);
  await closeConnections();
});

describe("changing a password", () => {
  it("replaces the password", async () => {
    await changePassword(user.userId, "a brand new password");
    assert.equal(await verifyPassword(user.userId, "a brand new password"), true);
    assert.equal(await verifyPassword(user.userId, "wrong"), false);
  });

  it("logs out the other devices and keeps this one", async () => {
    const here = await startSession(user.userId);
    const phone = await startSession(user.userId);
    await endOtherSessions(user.userId, here);
    assert.equal(await sessionUser(here), user.userId);
    assert.equal(await sessionUser(phone), null);
  });

  it("does not create an account that does not exist", async () => {
    await changePassword(`${user.userId}_ghost`, "whatever password");
    assert.equal(await userExists(`${user.userId}_ghost`), false);
  });
});
