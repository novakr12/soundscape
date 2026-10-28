import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { migrate } from "../../lib/migrations";
import { sql } from "../../lib/postgres";

const run = randomBytes(4).toString("hex");
const user = `pg_${run}`;
const friend = `pg_${run}_friend`;
const artist = `pg-artist-${run}`;
const [first, second] = [`${artist}-first`, `${artist}-second`];

async function counts() {
  const rows = await sql`SELECT track_id, plays FROM user_track_plays WHERE user_id = ${user} ORDER BY track_id`;
  return rows.map((row) => [row.track_id, row.plays]);
}

before(async () => {
  await migrate(sql);
  await sql`INSERT INTO users (username, password_hash) VALUES (${user}, 'x'), (${friend}, 'x')`;
  await sql`INSERT INTO artists (id, name) VALUES (${artist}, 'Postgres Test')`;
  await sql`INSERT INTO tracks (id, title, artist_id) VALUES (${first}, 'First', ${artist}), (${second}, 'Second', ${artist})`;
});

after(async () => {
  await sql`DELETE FROM users WHERE username IN (${user}, ${friend})`;
  await sql`DELETE FROM artists WHERE id = ${artist}`;
  await sql.end();
});

describe("PostgreSQL schema", () => {
  it("applies each migration once, even when started twice at the same time", async () => {
    assert.deepEqual(await Promise.all([migrate(sql), migrate(sql)]), [[], []]);
    const [row] = await sql`SELECT count(*)::int AS n FROM schema_migrations WHERE version = '001_initial'`;
    assert.equal(row.n, 1);
  });

  it("keeps play counts in step with the plays", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await sql`INSERT INTO plays ${sql(
      ids.map((id, i) => ({
        id,
        user_id: user,
        track_id: i < 2 ? first : second,
        played_at: new Date(Date.now() - i * 60_000),
      })),
    )}`;
    assert.deepEqual(await counts(), [
      [first, 2],
      [second, 1],
    ]);

    await sql`UPDATE plays SET track_id = ${second} WHERE id = ${ids[0]}`;
    assert.deepEqual(await counts(), [
      [first, 1],
      [second, 2],
    ]);

    await sql`DELETE FROM plays WHERE track_id = ${first}`;
    assert.deepEqual(await counts(), [[second, 2]]);
  });

  it("refuses plays of unknown songs and following yourself", async () => {
    await assert.rejects(
      sql`INSERT INTO plays (id, user_id, track_id, played_at) VALUES (${randomUUID()}, ${user}, 'no-such-song', now())`,
      /foreign key/,
    );
    await assert.rejects(sql`INSERT INTO follows (follower, followee) VALUES (${user}, ${user})`, /check constraint/);
  });

  it("removes an account's plays, counts and follows with the account", async () => {
    await sql`INSERT INTO follows (follower, followee) VALUES (${friend}, ${user}), (${user}, ${friend})`;
    await sql`DELETE FROM users WHERE username = ${user}`;
    const [left] = await sql`
      SELECT (SELECT count(*) FROM plays WHERE user_id = ${user})::int AS plays,
             (SELECT count(*) FROM user_track_plays WHERE user_id = ${user})::int AS counts,
             (SELECT count(*) FROM follows WHERE follower = ${user} OR followee = ${user})::int AS follows`;
    assert.deepEqual({ ...left }, { plays: 0, counts: 0, follows: 0 });
  });
});
