import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { libraryAlbum, resolveTrackCover } from "../lib/track-album";

describe("resolveTrackCover", () => {
  it("prefers a valid direct cover over Navidrome art IDs", () => {
    assert.equal(
      resolveTrackCover({
        cover: "  https://cdn.example/cover.jpg  ",
        navidromeCover: "al-1",
        coverArt: "al-2",
      }),
      "https://cdn.example/cover.jpg",
    );
    assert.equal(
      resolveTrackCover({
        cover: "/api/cover/jid-kody-blu-31",
        coverArt: "al-2",
      }),
      "/api/cover/jid-kody-blu-31",
    );
  });

  it("falls back to navidromeCover and then coverArt when valid", () => {
    assert.equal(
      resolveTrackCover({ cover: null, navidromeCover: " al-1 ", coverArt: "al-2" }),
      "/api/navidrome/cover/al-1",
    );
    assert.equal(
      resolveTrackCover({ cover: "   ", navidromeCover: "bad/id", coverArt: "al-2" }),
      "/api/navidrome/cover/al-2",
    );
  });

  it("ignores unsafe cover URLs and invalid coverArt IDs", () => {
    assert.equal(
      resolveTrackCover({ cover: "javascript:alert(1)", navidromeCover: "../etc", coverArt: "al-9" }),
      "/api/navidrome/cover/al-9",
    );
    assert.equal(
      resolveTrackCover({ cover: "//evil.example/a.jpg", navidromeCover: "bad id", coverArt: "" }),
      undefined,
    );
    assert.equal(resolveTrackCover({}), undefined);
  });
});

describe("libraryAlbum", () => {
  it("builds a library album link only when albumId is a valid song ID", () => {
    assert.deepEqual(libraryAlbum({ album: " The Forever Story ", albumId: "al-42" }), {
      album: "The Forever Story",
      albumHref: "/music?album=al-42",
    });
    assert.deepEqual(libraryAlbum({ album: "The Forever Story", albumId: "bad/id" }), {
      album: "The Forever Story",
    });
    assert.equal(libraryAlbum({ album: "   ", albumId: "al-42" }), null);
    assert.equal(libraryAlbum(null), null);
  });
});
