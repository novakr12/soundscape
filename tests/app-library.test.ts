import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROOT, readNode, readQuery } from "../lib/app-library";

describe("the app's library", () => {
  it("reads the places it can open", () => {
    assert.deepEqual(readNode(null), { kind: "root" });
    assert.deepEqual(readNode("root"), { kind: "root" });
    assert.deepEqual(readNode("albums:added"), { kind: "albums", order: "added" });
    assert.deepEqual(readNode("albums:played"), { kind: "albums", order: "played" });
    assert.deepEqual(readNode("album:al-1"), { kind: "album", id: "al-1" });
    assert.deepEqual(readNode("playlist:pl-1"), { kind: "playlist", id: "pl-1" });
    assert.deepEqual(readNode("playlists"), { kind: "playlists" });
    assert.deepEqual(readNode("shuffle"), { kind: "shuffle" });
  });

  it("turns away anything else", () => {
    assert.equal(readNode("albums:year"), null);
    assert.equal(readNode("album:"), null);
    assert.equal(readNode("album:../../rest"), null);
    assert.equal(readNode("album:a:b"), null);
    assert.equal(readNode("artist:x"), null);
  });

  it("keeps searches short and real", () => {
    assert.equal(readQuery("  daft punk "), "daft punk");
    assert.equal(readQuery("   "), null);
    assert.equal(readQuery(null), null);
    assert.equal(readQuery("x".repeat(500))?.length, 200);
  });

  it("opens on four tabs, one of them playable", () => {
    assert.deepEqual(
      ROOT.map((item) => [item.node, item.playable]),
      [
        ["albums:added", false],
        ["albums:played", false],
        ["playlists", false],
        ["shuffle", true],
      ],
    );
  });
});
