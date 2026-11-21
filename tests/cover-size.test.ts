import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverSize, readCoverSize, sizedCover } from "../lib/cover-size";

describe("cover sizes", () => {
  it("asks for about twice the shown size", () => {
    assert.equal(coverSize(40), 96);
    assert.equal(coverSize(48), 96);
    assert.equal(coverSize(64), 160);
    assert.equal(coverSize(128), 256);
    assert.equal(coverSize(200), 300);
  });

  it("asks our own cover routes for a smaller picture", () => {
    assert.equal(sizedCover("/api/cover/abc", 40), "/api/cover/abc?size=96");
    assert.equal(sizedCover("/api/navidrome/cover/al-1", 128), "/api/navidrome/cover/al-1?size=256");
    assert.equal(sizedCover("/api/cover/abc?x=1", 40), "/api/cover/abc?x=1&size=96");
    assert.equal(sizedCover("/api/cover/abc", 300), "/api/cover/abc");
  });

  it("asks Deezer for a smaller picture", () => {
    assert.equal(
      sizedCover("https://e-cdns-images.dzcdn.net/images/cover/0123abcd/250x250-000000-80-0-0.jpg", 40),
      "https://e-cdns-images.dzcdn.net/images/cover/0123abcd/96x96-000000-80-0-0.jpg",
    );
    assert.equal(
      sizedCover("https://cdn-images.dzcdn.net/images/artist/0123abcd/250x250-000000-80-0-0.jpg", 40),
      "https://cdn-images.dzcdn.net/images/artist/0123abcd/96x96-000000-80-0-0.jpg",
    );
    assert.equal(
      sizedCover("https://e-cdns-images.dzcdn.net/images/cover/0123abcd/56x56-000000-80-0-0.jpg", 40),
      "https://e-cdns-images.dzcdn.net/images/cover/0123abcd/56x56-000000-80-0-0.jpg",
    );
  });

  it("leaves other pictures alone", () => {
    const archive = "https://coverartarchive.org/release-group/abc/front-250";
    assert.equal(sizedCover(archive, 40), archive);
    assert.equal(sizedCover(undefined, 40), undefined);
  });

  it("only serves the sizes it knows", () => {
    assert.equal(readCoverSize("96"), 96);
    assert.equal(readCoverSize("97"), 300);
    assert.equal(readCoverSize(null), 300);
    assert.equal(readCoverSize("-1"), 300);
  });

  it("keys cached covers by size so resized covers are cached too", async () => {
    const { coverCacheKey, coverCacheKeys } = await import("../lib/covers");
    assert.equal(coverCacheKey("track-1", 300), "track-1");
    assert.equal(coverCacheKey("track-1", 96), "track-1@96");
    assert.deepEqual(coverCacheKeys("track-1"), ["track-1", "track-1@96", "track-1@160", "track-1@256"]);
  });
});
