import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicCover } from "../lib/covers";

describe("public cover for the Discord status", () => {
  const origin = "https://music.example";

  it("prefers a cover already hosted somewhere public", () => {
    assert.equal(
      publicCover("a-b", { cover: "https://cdn.example/x.jpg", navidrome_cover: "al-1" }, origin),
      "https://cdn.example/x.jpg",
    );
  });

  it("uses this server's open cover address when the server is on https", () => {
    assert.equal(
      publicCover("migos-need-it", { cover: null, navidrome_cover: "al-1" }, origin),
      "https://music.example/api/cover/migos-need-it",
    );
    assert.equal(
      publicCover("a-b", { cover: "https://music.example/api/navidrome/cover/al-1", navidrome_cover: null }, origin),
      "https://music.example/api/cover/a-b",
    );
  });

  it("gives nothing it can't share", () => {
    assert.equal(publicCover("a-b", { cover: null, navidrome_cover: "al-1" }, "http://192.168.1.5:3000"), null);
    assert.equal(publicCover("a-b", { cover: null, navidrome_cover: null }, origin), null);
    assert.equal(publicCover("a-b", undefined, origin), null);
  });
});
