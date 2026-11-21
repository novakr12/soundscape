import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readRelayToken } from "../lib/relay";
import { encrypt } from "../lib/servers";

process.env.AUTH_SECRET ??= "test-only-secret";

describe("readRelayToken", () => {
  it("decrypts encrypted ListenBrainz tokens", () => {
    const token = "12345678-1234-5678-1234-567812345678";
    const stored = encrypt(token, "relay");
    assert.notEqual(stored, token);
    assert.equal(readRelayToken(stored), token);
  });

  it("falls back to legacy plaintext tokens without throwing", () => {
    assert.equal(readRelayToken("12345678-1234-5678-1234-567812345678"), "12345678-1234-5678-1234-567812345678");
    assert.equal(readRelayToken("legacy-plain-token"), "legacy-plain-token");
  });
});
