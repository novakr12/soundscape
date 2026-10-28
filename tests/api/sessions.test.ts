import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sql } from "../../lib/postgres";
import { endSession, SESSION_DAYS, sessionUser, startSession } from "../../lib/sessions";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DAY_MS = 24 * 60 * 60 * 1000;
const user = testUser();

before(async () => {
  await createTestUser(user.userId);
});

after(async () => {
  await removeTestUser(user);
  await closeConnections();
});

describe("sessions", () => {
  it("knows who a session belongs to and stores only a hash of it", async () => {
    const token = await startSession(user.userId);
    assert.equal(await sessionUser(token), user.userId);
    assert.equal((await sql`SELECT 1 FROM sessions WHERE id = ${token}`).length, 0);
    assert.equal(await sessionUser("made-up"), null);
    assert.equal(await sessionUser(undefined), null);
  });

  it("stays valid while used and ends after a month without visits", async () => {
    const token = await startSession(user.userId);
    const later = Date.now() + (SESSION_DAYS - 1) * DAY_MS;
    assert.equal(await sessionUser(token, later), user.userId);
    assert.equal(await sessionUser(token, later + (SESSION_DAYS - 1) * DAY_MS), user.userId);
    assert.equal(await sessionUser(token, later + (SESSION_DAYS + 1) * DAY_MS * 2), null);
  });

  it("ends on log out", async () => {
    const token = await startSession(user.userId);
    await endSession(token);
    assert.equal(await sessionUser(token), null);
  });

  it("does not let a cookie in", async () => {
    const response = await fetch(`${BASE_URL}/settings`, {
      headers: { cookie: "soundscape_session=made-up" },
      redirect: "manual",
    });
    assert.equal(response.status, 307);
    assert.match(response.headers.get("location") ?? "", /\/login$/);
  });

  it("lets a real session in", async () => {
    const token = await startSession(user.userId);
    const response = await fetch(`${BASE_URL}/settings`, { headers: { cookie: `soundscape_session=${token}` } });
    assert.equal(response.status, 200);
    assert.match(await response.text(), new RegExp(user.userId));
  });
});
