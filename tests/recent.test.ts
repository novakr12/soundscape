import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { distinctTracks } from "../lib/live";

describe("recently played", () => {
  it("shows each song once, at its latest play", () => {
    const rows = ["a", "a", "a", "b", "a", "c", "b", "d"].map((track_id, index) => ({ track_id, index }));
    assert.deepEqual(
      distinctTracks(rows, 3).map((row) => [row.track_id, row.index]),
      [
        ["a", 0],
        ["b", 3],
        ["c", 5],
      ],
    );
    assert.deepEqual(
      distinctTracks(rows, 10).map((row) => row.track_id),
      ["a", "b", "c", "d"],
    );
    assert.deepEqual(distinctTracks([], 5), []);
  });
});
