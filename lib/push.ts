import type { JSONValue } from "postgres";
import webpush from "web-push";
import { getValue } from "./kv";
import { sql } from "./postgres";

const VAPID_KEY = "push:vapid";
const MAX_DEVICES = 20;
const SEND_TIMEOUT_MS = 10_000;
const TTL_SECONDS = 24 * 60 * 60;
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "notify.windows.com",
];

export class PushError extends Error {}

export type PushMessage = { title: string; body: string; url: string; tag?: string };
export type PushSubscriptionJson = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
type VapidKeys = { publicKey: string; privateKey: string };

const contact = () => process.env.PUSH_CONTACT || "https://github.com/novakr12/soundscape";

function allowedHosts() {
  const extra = (process.env.PUSH_EXTRA_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return { known: PUSH_HOSTS, extra };
}

export function pushEndpointAllowed(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const { known, extra } = allowedHosts();
  if (extra.includes(host)) return url.protocol === "https:" || url.protocol === "http:";
  return url.protocol === "https:" && known.some((name) => host === name || host.endsWith(`.${name}`));
}

export async function vapidKeys(): Promise<VapidKeys> {
  const saved = await getValue<VapidKeys>(VAPID_KEY);
  if (saved) return saved;
  const fresh = webpush.generateVAPIDKeys();
  await sql`
    INSERT INTO kv (key, value, expires_at) VALUES (${VAPID_KEY}, ${sql.json(fresh as unknown as JSONValue)}, NULL)
    ON CONFLICT (key) DO NOTHING`;
  return (await getValue<VapidKeys>(VAPID_KEY)) ?? fresh;
}

export async function savePushDevice(
  userId: string,
  subscription: PushSubscriptionJson,
  userAgent?: string | null,
  sessionId?: string | null,
) {
  const endpoint = typeof subscription?.endpoint === "string" ? subscription.endpoint : "";
  const p256dh = typeof subscription?.keys?.p256dh === "string" ? subscription.keys.p256dh : "";
  const auth = typeof subscription?.keys?.auth === "string" ? subscription.keys.auth : "";
  if (!endpoint || !p256dh || !auth || endpoint.length > 1000 || p256dh.length > 200 || auth.length > 100) {
    throw new PushError("This browser gave an incomplete push subscription.");
  }
  if (!pushEndpointAllowed(endpoint)) throw new PushError("This browser uses a push service Soundscape doesn't know.");
  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM push_subscriptions WHERE user_id = ${userId} AND endpoint <> ${endpoint}`;
  if (count >= MAX_DEVICES) {
    throw new PushError(`Notifications are on for ${MAX_DEVICES} devices already. Turn them off on one first.`);
  }
  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, session_id)
    VALUES (${userId}, ${endpoint}, ${p256dh}, ${auth}, ${userAgent?.slice(0, 200) ?? null}, ${sessionId ?? null})
    ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
      user_agent = excluded.user_agent, session_id = excluded.session_id, created_at = now()`;
}

export async function removePushDevice(userId: string, endpoint: string) {
  await sql`DELETE FROM push_subscriptions WHERE user_id = ${userId} AND endpoint = ${endpoint}`;
}

export async function pushDeviceCount(userId: string): Promise<number> {
  const [row] = await sql`SELECT count(*)::int AS count FROM push_subscriptions WHERE user_id = ${userId}`;
  return row.count;
}

export async function sendPush(userId: string, message: PushMessage): Promise<number> {
  const devices = await sql`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}`;
  if (devices.length === 0) return 0;
  const keys = await vapidKeys();
  const payload = JSON.stringify(message);
  let delivered = 0;
  await Promise.all(
    devices.map(async (device) => {
      if (!pushEndpointAllowed(device.endpoint)) return;
      try {
        const request = webpush.generateRequestDetails(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          payload,
          {
            TTL: TTL_SECONDS,
            urgency: "normal",
            vapidDetails: { subject: contact(), publicKey: keys.publicKey, privateKey: keys.privateKey },
          },
        );
        const response = await fetch(request.endpoint, {
          method: "POST",
          headers: request.headers as Record<string, string>,
          body: request.body ? new Uint8Array(request.body) : undefined,
          redirect: "error",
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (response.status === 404 || response.status === 410) {
          await sql`DELETE FROM push_subscriptions WHERE id = ${device.id}`;
        } else if (response.ok) {
          delivered++;
          await sql`UPDATE push_subscriptions SET last_sent_at = now() WHERE id = ${device.id}`;
        }
      } catch {}
    }),
  );
  return delivered;
}
