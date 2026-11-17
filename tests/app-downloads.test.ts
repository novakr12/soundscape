import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { downloadTracks, readAndroidApp, summarize } from "../lib/app-downloads";

describe("readAndroidApp", () => {
  it("reads which songs the app has", () => {
    const app = readAndroidApp({ version: "0.5.0", downloads: { a: "done", b: "waiting", c: "failed", d: "odd" } });
    assert.deepEqual(app, { version: "0.5.0", downloads: { a: "done", b: "waiting", c: "failed" } });
    assert.deepEqual(readAndroidApp({ version: "0.5.0" })?.downloads, {});
  });

  it("ignores anything that isn't the app", () => {
    assert.equal(readAndroidApp(undefined), null);
    assert.equal(readAndroidApp({ downloads: {} }), null);
    assert.equal(readAndroidApp("0.5.0"), null);
  });
});

describe("downloadTracks", () => {
  it("hands the app each song once with what it needs offline", () => {
    const tracks = downloadTracks([
      { trackId: "a-1", songId: "nd-1", title: "One", artist: "A", album: "X", duration: 200, cover: "/c" },
      { trackId: "a-1", title: "One again", artist: "A" },
      { trackId: "a-2", title: "Two", artist: "A" },
    ]);
    assert.deepEqual(tracks, [
      { trackId: "a-1", songId: "nd-1", title: "One", artist: "A", album: "X", cover: "/c", duration: 200 },
      { trackId: "a-2", title: "Two", artist: "A" },
    ]);
  });
});

describe("summarize", () => {
  it("counts what's downloaded, waiting and failed", () => {
    assert.deepEqual(summarize(["a", "b", "c", "d"], { a: "done", b: "waiting", c: "failed", x: "done" }), {
      total: 4,
      done: 1,
      waiting: 1,
      failed: 1,
    });
  });
});
