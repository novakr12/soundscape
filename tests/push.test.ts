import assert from "node:assert/strict";
import { createDecipheriv, createECDH, type ECDH, hkdfSync, randomBytes } from "node:crypto";
import { describe, it, mock } from "node:test";
import url from "node:url";
import webpush from "web-push";
import { buildPushRequest } from "../lib/push";

function decrypt(body: Uint8Array, ecdh: ECDH, auth: Buffer) {
  const bytes = Buffer.from(body);
  const salt = bytes.subarray(0, 16);
  const idLength = bytes[20];
  const serverKey = bytes.subarray(21, 21 + idLength);
  const content = bytes.subarray(21 + idLength);
  const shared = ecdh.computeSecret(serverKey);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), serverKey]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, info, 32));
  const key = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(content.subarray(-16));
  const plain = Buffer.concat([decipher.update(content.subarray(0, -16)), decipher.final()]);
  let end = plain.length - 1;
  while (plain[end] === 0) end--;
  return JSON.parse(plain.subarray(0, end).toString());
}

describe("push requests", () => {
  it("encrypts and signs without using legacy url.parse", () => {
    const parseSpy = mock.method(url, "parse");
    try {
      const ecdh = createECDH("prime256v1");
      ecdh.generateKeys();
      const auth = randomBytes(16);
      const keys = webpush.generateVAPIDKeys();
      const message = { title: "New follower", body: "Alice started following you.", url: "/u/alice" };
      const { headers, body } = buildPushRequest(
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/abc",
          p256dh: ecdh.getPublicKey().toString("base64url"),
          auth: auth.toString("base64url"),
        },
        JSON.stringify(message),
        keys,
      );

      assert.equal(parseSpy.mock.callCount(), 0);
      assert.equal(headers["Content-Encoding"], "aes128gcm");
      assert.equal(headers["Content-Type"], "application/octet-stream");
      assert.equal(headers["Content-Length"], String(body.byteLength));
      assert.equal(headers.TTL, "86400");
      assert.equal(headers.Urgency, "normal");
      const match = headers.Authorization.match(/^vapid t=([\w-]+\.([\w-]+)\.[\w-]+), k=([\w-]+)$/);
      assert.ok(match);
      assert.equal(match[3], keys.publicKey);
      const claims = JSON.parse(Buffer.from(match[2], "base64url").toString()) as { aud: string };
      assert.equal(claims.aud, "https://fcm.googleapis.com");
      assert.deepEqual(decrypt(body, ecdh, auth), message);
    } finally {
      parseSpy.mock.restore();
    }
  });
});
