import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { follow } from "../../lib/follows";
import { importListens } from "../../lib/imports";
import { getListeningClock, listenerKind } from "../../lib/listening-clock";
import { setPrivate } from "../../lib/privacy";
import { getListeningHeatmap } from "../../lib/stats";
import { addDays, localDay, startOfDay, WEEKDAYS } from "../../lib/time";
import { closeConnections, createTestUser, removeTestUser, testUser } from "./helpers";

const me = testUser();
const friend = testUser();
const quiet = testUser();
const hidden = testUser();
const users = [me, friend, quiet, hidden];
const day = addDays(localDay(new Date()), -10);
const at = (hour: number, minute = 0) => new Date(startOfDay(day).getTime() + hour * 3_600_000 + minute * 60_000);
const plays = (user: ReturnType<typeof testUser>, hours: number[]) =>
  importListens(
    user.userId,
    hours.map((hour, n) => ({ artist: user.artist, title: `Song ${n}`, playedAt: at(hour, n % 50) })),
  );

before(async () => {
  for (const user of users) await createTestUser(user.userId);
  await plays(me, [23, 23, 23, 22, 9]);
  await plays(friend, [...Array(15).fill(18), ...Array(5).fill(8)]);
  await plays(quiet, [3, 3]);
  await plays(hidden, Array(30).fill(6));
  for (const other of [friend, quiet, hidden]) assert.equal(await follow(me.userId, other.userId), null);
  await setPrivate(hidden.userId, true);
});

after(async () => {
  for (const user of users) await removeTestUser(user);
  await closeConnections();
});

describe("listening clock", () => {
  it("names the kind of listener by the busiest hour", () => {
    assert.deepEqual([6, 12, 19, 23, 2].map(listenerKind), [
      "early bird",
      "daytime listener",
      "evening listener",
      "night owl",
      "night owl",
    ]);
  });

  it("shows your share per hour next to the people you follow", async () => {
    const clock = await getListeningClock(me.userId, await getListeningHeatmap(me.userId));
    assert.ok(clock);
    assert.equal(clock.peakHour, 23);
    assert.equal(clock.kind, "night owl");
    assert.equal(clock.hours[23].you, 0.6);
    assert.equal(clock.hours[9].you, 0.2);
    assert.equal(clock.following, 1);
    assert.equal(clock.followingPeakHour, 18);
    assert.equal(clock.hours[18].following, 0.75);
    assert.equal(clock.hours[3].following, 0);
    assert.equal(clock.hours[6].following, 0);
    assert.equal(clock.busiestDay, WEEKDAYS[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7]);
    assert.ok(Math.abs(clock.hours.reduce((sum, hour) => sum + hour.you, 0) - 1) < 1e-9);
  });

  it("has nothing to show without plays", async () => {
    assert.equal(
      await getListeningClock(
        quiet.userId,
        Array.from({ length: 7 }, () => Array(24).fill(0)),
      ),
      null,
    );
  });
});
