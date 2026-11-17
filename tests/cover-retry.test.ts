import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retryAddress } from "../lib/cover-retry";

const origin = "https://music.example";

describe("retryAddress", () => {
  it("asks for a Soundscape cover once more", () => {
    assert.equal(retryAddress("/api/navidrome/cover/al-1", origin, 7), "/api/navidrome/cover/al-1?again=7");
    assert.equal(retryAddress("/api/cover/band-song", origin, 7), "/api/cover/band-song?again=7");
    assert.equal(
      retryAddress("https://music.example/api/cover/band-song?size=80", origin, 7),
      "/api/cover/band-song?size=80&again=7",
    );
  });

  it("gives up after the second try", () => {
    assert.equal(retryAddress("/api/cover/band-song?again=3", origin, 7), null);
  });

  it("leaves other images alone", () => {
    assert.equal(retryAddress("https://cdn.example/cover.jpg", origin, 7), null);
    assert.equal(retryAddress("https://music.example.evil.test/api/cover/x", origin, 7), null);
    assert.equal(retryAddress("/icon.svg", origin, 7), null);
    assert.equal(retryAddress("", origin, 7), null);
  });
});
