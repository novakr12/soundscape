import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sql } from "../../lib/postgres";
import { createToken, listTokens, MAX_TOKENS, revokeToken, TokenError, userForAuthorization } from "../../lib/tokens";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const me = testUser();
const other = testUser();

before(async () => {
  for (const user of [me, other]) await createTestUser(user.userId);
});

after(async () => {
  for (const user of [me, other]) await removeTestUser(user);
  await closeConnections();
});

describe("device tokens", () => {
  it("gives every device its own working token, stored only as a hash", async () => {
    const navidrome = await createToken(me.userId, "  Navidrome   server ");
    const phone = await createToken(me.userId, "Phone");
    assert.notEqual(navidrome, phone);
    assert.equal(await userForAuthorization(`Token ${navidrome}`), me.userId);
    assert.equal(await userForAuthorization(`token ${phone}`), me.userId);
    assert.equal(await userForAuthorization(`Token ${phone}x`), null);
    assert.equal(await userForAuthorization(phone), null);

    const stored = await sql`SELECT token FROM api_tokens WHERE user_id = ${me.userId}`;
    assert.equal(stored.length, 2);
    assert.ok(
      stored.every((row) => row.token !== navidrome && row.token !== phone && /^[0-9a-f]{64}$/.test(row.token)),
    );

    const tokens = await listTokens(me.userId);
    assert.deepEqual(
      tokens.map((token) => [token.name, token.hint]),
      [
        ["Phone", phone.slice(-4)],
        ["Navidrome server", navidrome.slice(-4)],
      ],
    );
  });

  it("remembers when and by which app a token was last used", async () => {
    const token = await createToken(me.userId, "Browser");
    assert.equal((await listTokens(me.userId)).find((t) => t.name === "Browser")?.lastUsedAt, undefined);
    await userForAuthorization(`Token ${token}`, "WebScrobbler/3.0");
    const used = (await listTokens(me.userId)).find((t) => t.name === "Browser");
    assert.ok(used?.lastUsedAt && Date.now() - used.lastUsedAt.getTime() < 60_000);
    assert.equal(used?.lastUsedBy, "WebScrobbler/3.0");
  });

  it("revokes only your own tokens", async () => {
    const token = await createToken(me.userId, "Old laptop");
    const id = (await listTokens(me.userId)).find((t) => t.name === "Old laptop")?.id ?? 0;
    assert.equal(await revokeToken(other.userId, id), false);
    assert.equal(await userForAuthorization(`Token ${token}`), me.userId);
    assert.equal(await revokeToken(me.userId, id), true);
    assert.equal(await userForAuthorization(`Token ${token}`), null);
    assert.equal(
      (await listTokens(me.userId)).some((t) => t.name === "Old laptop"),
      false,
    );
  });

  it("needs a name and stops at the limit", async () => {
    await assert.rejects(() => createToken(other.userId, "   "), TokenError);
    for (let i = 0; i < MAX_TOKENS; i++) await createToken(other.userId, `Device ${i}`);
    await assert.rejects(() => createToken(other.userId, "One too many"), /at most 20 tokens/);
  });
});
