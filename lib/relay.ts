import type { JSONValue } from "postgres";
import { deleteValues, takeLock } from "./kv";
import { advanceImportState } from "./listenbrainz";
import { sql } from "./postgres";

const RELAY_URL = process.env.LISTENBRAINZ_RELAY_URL ?? "https://api.listenbrainz.org/1/";
const MAX_QUEUE = 10_000;
const FLUSH_BATCH = 50;
const FLUSH_LOCK = "relay:flush";
const FLUSH_LOCK_SECONDS = 10 * 60;

export type Relay = {
  token: string;
  listenBrainzUser: string;
};

type Submission = {
  listen_type?: string;
  payload?: { listened_at?: number }[];
};

type SendResult = "ok" | "retry" | "rejected";

export class RelayError extends Error {}

export async function getRelay(userId: string): Promise<Relay | null> {
  const [row] = await sql`SELECT listenbrainz_token, listenbrainz_user FROM relay_settings WHERE user_id = ${userId}`;
  return row ? { token: row.listenbrainz_token, listenBrainzUser: row.listenbrainz_user } : null;
}

export async function saveRelay(userId: string, token: string): Promise<Relay> {
  let response: Response;
  try {
    response = await fetch(`${RELAY_URL}validate-token`, {
      headers: { Authorization: `Token ${token}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new RelayError("ListenBrainz is unreachable, try again later.");
  }
  const body = (await response.json().catch(() => null)) as { valid?: boolean; user_name?: string } | null;
  if (!body?.valid || !body.user_name) throw new RelayError("ListenBrainz did not accept that token.");

  await sql`
    INSERT INTO relay_settings (user_id, listenbrainz_token, listenbrainz_user) VALUES (${userId}, ${token}, ${body.user_name})
    ON CONFLICT (user_id) DO UPDATE SET listenbrainz_token = excluded.listenbrainz_token,
      listenbrainz_user = excluded.listenbrainz_user, created_at = now()`;
  return { token, listenBrainzUser: body.user_name };
}

export async function removeRelay(userId: string) {
  await sql`DELETE FROM relay_settings WHERE user_id = ${userId}`;
  await sql`DELETE FROM relay_queue WHERE user_id = ${userId}`;
}

async function send(token: string, body: Submission): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(`${RELAY_URL}submit-listens`, {
      method: "POST",
      headers: { Authorization: `Token ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return "retry";
  }
  if (response.ok) return "ok";
  if (response.status === 429 || response.status >= 500) return "retry";
  console.warn(`ListenBrainz relay: rejected with ${response.status}`);
  return "rejected";
}

async function delivered(userId: string, relay: Relay, body: Submission) {
  if (body.listen_type === "playing_now" || !body.payload?.length) return;
  const newest = Math.max(...body.payload.map((listen) => listen.listened_at ?? Math.floor(Date.now() / 1000)));
  await advanceImportState(userId, relay.listenBrainzUser, new Date(newest * 1000));
}

export async function flushRelayQueue() {
  if (!(await takeLock(FLUSH_LOCK, FLUSH_LOCK_SECONDS))) return;
  try {
    for (let i = 0; i < FLUSH_BATCH; i++) {
      const [job] = await sql`SELECT id, user_id, body FROM relay_queue ORDER BY id LIMIT 1`;
      if (!job) return;
      const relay = await getRelay(job.user_id);
      const result = relay ? await send(relay.token, job.body) : "rejected";
      if (result === "retry") return;
      await sql`DELETE FROM relay_queue WHERE id = ${job.id}`;
      if (result === "ok") await delivered(job.user_id, relay!, job.body);
    }
  } finally {
    await deleteValues(FLUSH_LOCK);
  }
}

export async function relaySubmission(userId: string, body: Submission) {
  const relay = await getRelay(userId);
  if (!relay) return;

  const result = await send(relay.token, body);
  if (result === "ok") {
    await delivered(userId, relay, body);
    await flushRelayQueue();
  } else if (result === "retry" && body.listen_type !== "playing_now") {
    await sql`INSERT INTO relay_queue (user_id, body) VALUES (${userId}, ${sql.json(body as JSONValue)})`;
    await sql`DELETE FROM relay_queue WHERE id <= (SELECT max(id) FROM relay_queue) - ${MAX_QUEUE}`;
  }
}

export async function queuedForUser(userId: string): Promise<number> {
  const [{ queued }] = await sql`SELECT count(*) AS queued FROM relay_queue WHERE user_id = ${userId}`;
  return queued;
}
