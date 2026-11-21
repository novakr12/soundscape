import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicOrigin } from "../lib/public-origin";

describe("publicOrigin", () => {
  it("ignores cross-origin Referer headers", () => {
    const request = new Request("http://127.0.0.1:3000/connect/lastfm", {
      headers: {
        host: "music.example",
        "x-forwarded-proto": "https",
        referer: "https://evil.example/phish",
      },
    });
    assert.equal(publicOrigin(request), "https://music.example");
  });

  it("uses X-Forwarded-Host and X-Forwarded-Proto when proxied", () => {
    const request = new Request("http://127.0.0.1:3000/api/cover-link", {
      headers: {
        host: "internal:3000",
        "x-forwarded-host": "soundscape.example, proxy.internal",
        "x-forwarded-proto": "https, http",
      },
    });
    assert.equal(publicOrigin(request), "https://soundscape.example");
  });

  it("can inherit https protocol from a same-host Referer when X-Forwarded-Proto is absent", () => {
    const request = new Request("http://127.0.0.1:3000/connect/lastfm", {
      headers: {
        host: "music.example",
        referer: "https://music.example/connect",
      },
    });
    assert.equal(publicOrigin(request), "https://music.example");
  });

  it("falls back to request.url origin when Host header is malformed", () => {
    const request = new Request("http://localhost:3000/connect/lastfm", {
      headers: {
        "x-forwarded-host": "bad host / evil",
      },
    });
    assert.equal(publicOrigin(request), "http://localhost:3000");
  });
});
