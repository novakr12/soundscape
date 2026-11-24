import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublicOrigin, publicCover } from "../lib/covers";

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

  it("rejects Tailscale and private origins for server covers while keeping external CDNs", () => {
    for (const privateOrigin of [
      "https://box.tail1234.ts.net",
      "https://100.64.1.2",
      "https://[fd7a:115c:a1e0::1]",
      "https://[::ffff:100.64.1.2]",
      "https://192.168.1.5",
      "https://10.0.0.5",
      "https://nas.local",
      "https://nas",
      "https://localhost:3000",
    ]) {
      assert.equal(isPublicOrigin(privateOrigin), false, `${privateOrigin} should be private`);
      assert.equal(publicCover("a-b", { cover: null, navidrome_cover: "al-1" }, privateOrigin), null);
      assert.equal(
        publicCover(
          "sleep-dopesmoker",
          { cover: "https://is1-ssl.mzstatic.com/image/thumb/Music/cover.jpg/600x600bb.jpg", navidrome_cover: "al-1" },
          privateOrigin,
        ),
        "https://is1-ssl.mzstatic.com/image/thumb/Music/cover.jpg/600x600bb.jpg",
      );
      assert.equal(
        publicCover("a-b", { cover: "https://cdn.example/x.jpg", navidrome_cover: "al-1" }, privateOrigin),
        "https://cdn.example/x.jpg",
      );
    }
    assert.equal(isPublicOrigin("https://100.63.255.254"), true);
    assert.equal(isPublicOrigin("https://100.128.0.1"), true);
    assert.equal(isPublicOrigin(origin), true);
  });
});
