import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { importListens } from "../../lib/imports";
import { tasteMatch } from "../../lib/taste";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const [alice, bob, carol, dave, erin] = Array.from({ length: 5 }, () => testUser());
const [a, b, c] = [alice.artist, bob.artist, carol.artist];

function plays(artist: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    artist,
    title: `Song ${i % 2}`,
    playedAt: new Date(Date.now() - (i + 1) * 60_000),
  }));
}

before(async () => {
  for (const user of [alice, bob, carol, dave, erin]) await createTestUser(user.userId);
  await importListens(alice.userId, [...plays(a, 4), ...plays(b, 1)]);
  await importListens(bob.userId, [...plays(a, 4), ...plays(b, 1)]);
  await importListens(carol.userId, [...plays(b, 9), ...plays(c, 3)]);
  await importListens(erin.userId, plays(c, 2));
});

after(async () => {
  for (const user of [alice, bob, carol, dave, erin]) await removeTestUser(user);
  await closeConnections();
});

describe("taste match", () => {
  it("is 100% for the same taste", async () => {
    const match = await tasteMatch(alice.userId, bob.userId);
    assert.equal(match?.score, 100);
    assert.equal(match?.sharedCount, 2);
    assert.deepEqual(
      match?.sharedArtists.map((artist) => artist.name),
      [a, b],
    );
  });

  it("scores partial overlap between 0 and 100 the same both ways", async () => {
    const there = await tasteMatch(alice.userId, carol.userId);
    const back = await tasteMatch(carol.userId, alice.userId);
    assert.ok(there && there.score > 0 && there.score < 100, `score ${there?.score}`);
    assert.equal(back?.score, there.score);
    assert.deepEqual(
      there.sharedArtists.map((artist) => artist.name),
      [b],
    );
  });

  it("is 0% with nothing in common", async () => {
    assert.deepEqual(await tasteMatch(alice.userId, erin.userId), { score: 0, sharedCount: 0, sharedArtists: [] });
  });

  it("has no match when one of them has no plays", async () => {
    assert.equal(await tasteMatch(alice.userId, dave.userId), null);
  });
});
