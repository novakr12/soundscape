import assert from "node:assert/strict";
import { createDecipheriv, createECDH, type ECDH, hkdfSync, randomBytes } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { follow } from "../../lib/follows";
import { importListens } from "../../lib/imports";
import { checkMilestones, pushesSent } from "../../lib/notifications";
import { sql } from "../../lib/postgres";
import { pushDeviceCount, pushEndpointAllowed, removePushDevice, savePushDevice, sendPush } from "../../lib/push";
import { endOtherSessions, endSession, sessionKey, startSession } from "../../lib/sessions";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const me = testUser();
const fan = testUser();
const received: { path: string; headers: IncomingHttpHeaders; body: Buffer }[] = [];
let answer = 201;
let base = "";

const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    received.push({ path: request.url ?? "", headers: request.headers, body: Buffer.concat(chunks) });
    response.writeHead(answer).end();
  });
});

function device() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const id = randomBytes(6).toString("hex");
  return {
    ecdh,
    auth,
    path: `/push/${id}`,
    subscription: {
      endpoint: `${base}/push/${id}`,
      keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    },
  };
}

function decrypt(body: Buffer, ecdh: ECDH, auth: Buffer) {
  const salt = body.subarray(0, 16);
  const idLength = body[20];
  const serverKey = body.subarray(21, 21 + idLength);
  const content = body.subarray(21 + idLength);
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

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.PUSH_EXTRA_HOSTS = "127.0.0.1";
  for (const user of [me, fan]) await createTestUser(user.userId);
});

after(async () => {
  server.close();
  for (const user of [me, fan]) await removeTestUser(user);
  await closeConnections();
});

describe("push notifications", () => {
  it("only sends to the browsers' own push services", () => {
    delete process.env.PUSH_EXTRA_HOSTS;
    assert.equal(pushEndpointAllowed("https://fcm.googleapis.com/fcm/send/abc"), true);
    assert.equal(pushEndpointAllowed("https://updates.push.services.mozilla.com/wpush/v2/abc"), true);
    assert.equal(pushEndpointAllowed("https://web.push.apple.com/abc"), true);
    assert.equal(pushEndpointAllowed("https://db5p.notify.windows.com/w/?token=abc"), true);
    assert.equal(pushEndpointAllowed("http://fcm.googleapis.com/fcm/send/abc"), false);
    assert.equal(pushEndpointAllowed("https://fcm.googleapis.com.evil.example/abc"), false);
    assert.equal(pushEndpointAllowed("https://192.168.1.1/abc"), false);
    assert.equal(pushEndpointAllowed(`${base}/push/x`), false);
    process.env.PUSH_EXTRA_HOSTS = "127.0.0.1";
    assert.equal(pushEndpointAllowed(`${base}/push/x`), true);
  });

  it("refuses unknown push services and broken subscriptions", async () => {
    await assert.rejects(
      () => savePushDevice(me.userId, { endpoint: "https://evil.example/x", keys: { p256dh: "a", auth: "b" } }),
      /push service Soundscape doesn't know/,
    );
    await assert.rejects(() => savePushDevice(me.userId, { endpoint: `${base}/push/x` }), /incomplete/);
    assert.equal(await pushDeviceCount(me.userId), 0);
  });

  it("sends an encrypted, signed notification when someone follows you", async () => {
    const phone = device();
    await savePushDevice(me.userId, phone.subscription, "Phone browser");
    received.length = 0;
    await follow(fan.userId, me.userId);
    await pushesSent();
    assert.equal(received.length, 1);
    const [push] = received;
    assert.equal(push.path, phone.path);
    assert.equal(push.headers["content-encoding"], "aes128gcm");
    assert.equal(push.headers.ttl, "86400");
    assert.match(String(push.headers.authorization), /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    assert.deepEqual(decrypt(push.body, phone.ecdh, phone.auth), {
      title: "New follower",
      body: `${fan.userId} started following you.`,
      url: `/u/${fan.userId}`,
      tag: `follow:follow:${fan.userId}`,
    });
    await removePushDevice(me.userId, phone.subscription.endpoint);
  });

  it("stays quiet for milestones recorded as already read", async () => {
    const laptop = device();
    await savePushDevice(fan.userId, laptop.subscription);
    await importListens(
      fan.userId,
      Array.from({ length: 600 }, (_, n) => ({
        artist: fan.artist,
        title: `Song ${n}`,
        playedAt: new Date(Date.now() - (n + 1) * 60_000),
      })),
    );
    received.length = 0;
    await checkMilestones([fan.userId]);
    await pushesSent();
    assert.equal(received.length, 0);
  });

  it("forgets devices the push service no longer knows", async () => {
    const old = device();
    await savePushDevice(me.userId, old.subscription);
    answer = 410;
    assert.equal(await sendPush(me.userId, { title: "t", body: "b", url: "/" }), 0);
    answer = 201;
    assert.equal(await pushDeviceCount(me.userId), 0);
  });

  it("stops notifications on a browser when you log out there", async () => {
    const here = await startSession(me.userId);
    const there = await startSession(me.userId);
    const first = device();
    const second = device();
    await savePushDevice(me.userId, first.subscription, null, sessionKey(here));
    await savePushDevice(me.userId, second.subscription, null, sessionKey(there));
    await endSession(there);
    assert.equal(await pushDeviceCount(me.userId), 1);
    const third = device();
    await savePushDevice(me.userId, third.subscription, null, sessionKey(there));
    await endOtherSessions(me.userId, here);
    const left = await sql`SELECT endpoint FROM push_subscriptions WHERE user_id = ${me.userId}`;
    assert.deepEqual(
      left.map((row) => row.endpoint),
      [first.subscription.endpoint],
    );
    await endSession(here);
    assert.equal(await pushDeviceCount(me.userId), 0);
  });
});
