import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { sql } from "../../lib/postgres";
import { claimInvite, createInvite, inviteUsable, releaseInvite, signupMode } from "../../lib/signups";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const user = testUser();
const codes: string[] = [];
const saved = process.env.SIGNUPS;

before(async () => {
  await createTestUser(user.userId);
});

afterEach(() => {
  process.env.SIGNUPS = saved;
});

after(async () => {
  await sql`DELETE FROM invites WHERE code = ANY(${codes})`;
  await removeTestUser(user);
  await closeConnections();
});

describe("sign-ups", () => {
  it("reads the mode from SIGNUPS and stays open for anything else", () => {
    for (const [value, mode] of [
      [undefined, "open"],
      ["invite", "invite"],
      [" Closed ", "closed"],
      ["nonsense", "open"],
    ] as const) {
      if (value === undefined) delete process.env.SIGNUPS;
      else process.env.SIGNUPS = value;
      assert.equal(signupMode(), mode);
    }
  });

  it("lets each invite create exactly one account", async () => {
    const code = await createInvite(user.userId);
    codes.push(code);
    assert.match(code, /^[A-Za-z0-9_-]{16}$/);
    assert.equal(await inviteUsable(code), true);
    const [first, second] = await Promise.all([claimInvite(code, "first_person"), claimInvite(code, "second_person")]);
    assert.equal(Number(first) + Number(second), 1);
    assert.equal(await inviteUsable(code), false);
  });

  it("gives the invite back when the account could not be created", async () => {
    const code = await createInvite(user.userId);
    codes.push(code);
    assert.equal(await claimInvite(code, "taken_name"), true);
    await releaseInvite(code, "someone_else");
    assert.equal(await inviteUsable(code), false);
    await releaseInvite(code, "taken_name");
    assert.equal(await inviteUsable(code), true);
  });

  it("refuses invites that were never made", async () => {
    assert.equal(await inviteUsable("made-up-code"), false);
    assert.equal(await inviteUsable(""), false);
    assert.equal(await claimInvite("made-up-code", "anyone"), false);
    assert.equal((await sql`SELECT * FROM invites WHERE code = 'made-up-code'`).length, 0);
  });
});
