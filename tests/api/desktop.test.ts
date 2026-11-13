import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { follow } from "../../lib/follows";
import { pushesSent } from "../../lib/notifications";
import { createToken } from "../../lib/tokens";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const me = testUser();
const fan = testUser();
const other = testUser();
let token = "";

const notifications = (header?: string, query = "") =>
  fetch(`${BASE_URL}/api/notifications${query}`, header ? { headers: { authorization: header } } : {});

before(async () => {
  for (const user of [me, fan, other]) await createTestUser(user.userId);
  token = await createToken(me.userId, "Desktop test");
});

after(async () => {
  await pushesSent();
  for (const user of [me, fan, other]) await removeTestUser(user);
  await closeConnections();
});

describe("desktop app API", () => {
  it("tells the app it found a Soundscape server", async () => {
    const response = await fetch(`${BASE_URL}/api/info`);
    assert.equal(response.status, 200);
    const info = await response.json();
    assert.equal(info.app, "soundscape");
    assert.equal(info.api, 1);
    assert.match(info.version, /^\d+\.\d+\.\d+/);
  });

  it("sends a logged-out connect request to the login page and back", async () => {
    const response = await fetch(`${BASE_URL}/desktop/connect?device=My%20laptop`, { redirect: "manual" });
    assert.ok([303, 307, 308].includes(response.status), String(response.status));
    const location = new URL(response.headers.get("location") ?? "", BASE_URL);
    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.get("next"), "/desktop/connect?device=My+laptop");
  });

  it("gives the app its notifications as text, newer than the last one it saw", async () => {
    assert.equal((await notifications()).status, 401);
    assert.equal((await notifications("Token not-a-real-token")).status, 401);

    await follow(fan.userId, me.userId);
    const first = await (await notifications(`Token ${token}`)).json();
    assert.equal(first.user, me.userId);
    assert.equal(first.unread, 1);
    assert.equal(first.notifications.length, 1);
    const [followed] = first.notifications;
    assert.equal(followed.kind, "follow");
    assert.equal(followed.body, `${fan.userId} started following you.`);
    assert.equal(followed.url, `/u/${fan.userId}`);

    await follow(other.userId, me.userId);
    const next = await (await notifications(`Token ${token}`, `?after=${followed.id}`)).json();
    assert.deepEqual(
      next.notifications.map((n: { body: string }) => n.body),
      [`${other.userId} started following you.`],
    );
  });

  it("lets the app revoke its own token when you sign out", async () => {
    const remove = () =>
      fetch(`${BASE_URL}/api/token`, { method: "DELETE", headers: { authorization: `Token ${token}` } });
    assert.equal((await remove()).status, 204);
    assert.equal((await remove()).status, 401);
    assert.equal((await notifications(`Token ${token}`)).status, 401);
  });
});
