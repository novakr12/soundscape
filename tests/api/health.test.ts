import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import postgres from "postgres";
import { checkHealth } from "../../lib/health";
import { closeConnections } from "./helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

after(async () => {
  await closeConnections();
});

describe("health check", () => {
  it("reports the database as up", async () => {
    const response = await fetch(`${BASE_URL}/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.postgres.ok, true);
  });

  it("reports a database that cannot be reached and does not wait long for it", async () => {
    const sql = postgres("postgres://soundscape:soundscape@127.0.0.1:9/soundscape", { max: 1, connect_timeout: 5 });
    const started = Date.now();
    const health = await checkHealth({ sql, timeoutMs: 500 });
    assert.equal(health.ok, false);
    assert.equal(health.postgres.ok, false);
    assert.ok(Date.now() - started < 1500);
    await sql.end({ timeout: 0 });
  });
});
