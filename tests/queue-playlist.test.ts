import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatQueueSaved,
  MAX_PLAYLIST_NAME,
  MAX_QUEUE_PLAYLIST_TRACKS,
  missingLibrarySongs,
  readQueuePlaylistRequest,
  resolveQueueSongIds,
} from "../lib/queue-playlist";

describe("queue-playlist helpers", () => {
  it("validates playlist name and queue tracks", () => {
    assert.equal(readQueuePlaylistRequest(null), null);
    assert.equal(readQueuePlaylistRequest([]), null);
    assert.equal(readQueuePlaylistRequest({ name: "   ", tracks: [{ trackId: "t1", title: "A", artist: "B" }] }), null);
    assert.equal(readQueuePlaylistRequest({ name: "Mix", tracks: [] }), null);
    assert.equal(readQueuePlaylistRequest({ name: "Mix", tracks: [{ trackId: "t1", title: "", artist: "B" }] }), null);

    const parsed = readQueuePlaylistRequest({
      name: `  ${"x".repeat(MAX_PLAYLIST_NAME + 20)}  `,
      tracks: [
        { trackId: " t1 ", title: " One ", artist: " Band ", songId: "nd-1" },
        { trackId: "t2", title: "Two", artist: "Band", songId: "../bad/id" },
        { trackId: "", title: "Bad", artist: "Band" },
      ],
    });
    assert.deepEqual(parsed, {
      name: "x".repeat(MAX_PLAYLIST_NAME),
      tracks: [
        { trackId: "t1", title: "One", artist: "Band", songId: "nd-1" },
        { trackId: "t2", title: "Two", artist: "Band" },
      ],
    });

    const tooMany = Array.from({ length: MAX_QUEUE_PLAYLIST_TRACKS + 25 }, (_, i) => ({
      trackId: `t-${i}`,
      title: `Song ${i}`,
      artist: "Band",
    }));
    const capped = readQueuePlaylistRequest({ name: "Long Queue", tracks: tooMany });
    assert.equal(capped?.tracks.length, MAX_QUEUE_PLAYLIST_TRACKS);
  });

  it("deduplicates tracks missing songId and preserves queue order with duplicates", () => {
    const tracks = [
      { trackId: "t1", title: "One", artist: "Band", songId: "nd-1" },
      { trackId: "t2", title: "Two", artist: "Band" },
      { trackId: "t3", title: "Three", artist: "Band" },
      { trackId: "t2", title: "Two", artist: "Band" },
    ];
    assert.deepEqual(missingLibrarySongs(tracks), [
      { trackId: "t2", title: "Two", artist: "Band" },
      { trackId: "t3", title: "Three", artist: "Band" },
    ]);

    const resolved = resolveQueueSongIds(tracks, new Map([["t2", "nd-2"]]));
    assert.deepEqual(resolved, {
      songIds: ["nd-1", "nd-2", "nd-2"],
      missing: 1,
    });
  });

  it("formats singular, plural and partial save confirmations", () => {
    assert.equal(
      formatQueueSaved({ name: "Late Night", saved: 1, total: 1, missing: 0 }),
      "Saved 1 song to “Late Night”",
    );
    assert.equal(
      formatQueueSaved({ name: "Road Trip", saved: 8, total: 8, missing: 0 }),
      "Saved 8 songs to “Road Trip”",
    );
    assert.equal(
      formatQueueSaved({ name: "Road Trip", saved: 6, total: 8, missing: 2 }),
      "Saved 6 of 8 songs to “Road Trip” (2 not in Navidrome)",
    );
  });
});
