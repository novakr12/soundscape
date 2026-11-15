import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seededShuffle, unplayedOf } from "../lib/unplayed";

describe("never played albums", () => {
  it("leaves out albums with a played song, matching names the way Soundscape stores them", () => {
    const albums = [
      { id: "a1", name: "Kid A", artist: "Radiohead" },
      { id: "a2", name: "In Rainbows", artist: "Radiohead feat. Someone" },
      { id: "a3", name: "Moon Safari", artist: "Air" },
    ];
    const played = new Set(["radiohead-kid-a", "radiohead-in-rainbows"]);
    assert.deepEqual(
      unplayedOf(albums, played).map((album) => album.id),
      ["a3"],
    );
  });

  it("shuffles the same way all day and differently the next day", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const today = seededShuffle(items, "user:2026-11-15");
    assert.deepEqual(seededShuffle(items, "user:2026-11-15"), today);
    assert.notDeepEqual(seededShuffle(items, "user:2026-11-16"), today);
    assert.deepEqual(
      [...today].sort((a, b) => a - b),
      items,
    );
  });
});
