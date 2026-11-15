import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recentReleases } from "../lib/new-releases";

describe("new releases", () => {
  it("keeps albums and EPs from the last month, not compilations, live albums or future dates", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const found = recentReleases(
      [
        { id: "a", title: "Fresh Album", "primary-type": "Album", "first-release-date": "2026-11-01" },
        { id: "b", title: "Small EP", "primary-type": "EP", "first-release-date": "2026-10-20" },
        { id: "c", title: "Old Album", "primary-type": "Album", "first-release-date": "2026-09-01" },
        {
          id: "d",
          title: "Best Of",
          "primary-type": "Album",
          "secondary-types": ["Compilation"],
          "first-release-date": "2026-11-02",
        },
        {
          id: "e",
          title: "Live Somewhere",
          "primary-type": "Album",
          "secondary-types": ["Live"],
          "first-release-date": "2026-11-03",
        },
        { id: "f", title: "A Single", "primary-type": "Single", "first-release-date": "2026-11-04" },
        { id: "g", title: "Next Year", "primary-type": "Album", "first-release-date": "2027-02-01" },
        { id: "h", title: "Only A Year", "primary-type": "Album", "first-release-date": "2026" },
      ],
      now,
    );
    assert.deepEqual(found, [
      { mbid: "a", title: "Fresh Album", kind: "Album", released: "2026-11-01" },
      { mbid: "b", title: "Small EP", kind: "EP", released: "2026-10-20" },
    ]);
  });
});
