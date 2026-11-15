import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentLine, fromLrclib, fromNavidrome, parseLrc } from "../lib/lyrics-text";

describe("lyrics", () => {
  it("reads time-synced LRC lines, including repeated ones", () => {
    const lines = parseLrc("[ar:Band]\n[00:12.50]First line\n[01:02.3][00:05.00]Chorus\n\nno stamp\n[00:20]");
    assert.deepEqual(lines, [
      { at: 5, text: "Chorus" },
      { at: 12.5, text: "First line" },
      { at: 20, text: "" },
      { at: 62.3, text: "Chorus" },
    ]);
  });

  it("takes synced lyrics from Navidrome when it has them", () => {
    const lyrics = fromNavidrome([
      { synced: false, line: [{ value: "plain" }] },
      {
        synced: true,
        offset: 500,
        line: [
          { start: 1000, value: "One" },
          { start: 3000, value: "Two" },
        ],
      },
    ]);
    assert.deepEqual(lyrics, {
      synced: true,
      lines: [
        { at: 1.5, text: "One" },
        { at: 3.5, text: "Two" },
      ],
      source: "navidrome",
    });
    assert.deepEqual(fromNavidrome([{ synced: false, line: [{ value: "Just words" }] }])?.lines, [
      { text: "Just words" },
    ]);
    assert.equal(fromNavidrome([]), null);
    assert.equal(fromNavidrome([{ synced: false, line: [{ value: " " }] }]), null);
  });

  it("picks the LRCLIB match with the right length, synced first", () => {
    const lyrics = fromLrclib(
      [
        { duration: 400, syncedLyrics: "[00:01.00]Wrong version" },
        { duration: 241, plainLyrics: "Plain\nwords" },
        { duration: 239, syncedLyrics: "[00:02.00]Right" },
      ],
      240,
    );
    assert.deepEqual(lyrics, { synced: true, lines: [{ at: 2, text: "Right" }], source: "lrclib" });
    assert.deepEqual(fromLrclib([{ duration: 240, plainLyrics: "A\nB" }], 240)?.lines, [{ text: "A" }, { text: "B" }]);
    assert.equal(fromLrclib([{ duration: 240, instrumental: true }], 240)?.instrumental, true);
    assert.equal(fromLrclib([{ duration: 100, plainLyrics: "x" }], 240), null);
    assert.equal(fromLrclib([], 240), null);
  });

  it("finds the line being sung", () => {
    const lines = [
      { at: 2, text: "a" },
      { at: 5, text: "b" },
      { at: 9, text: "c" },
    ];
    assert.equal(currentLine(lines, 0), -1);
    assert.equal(currentLine(lines, 2), 0);
    assert.equal(currentLine(lines, 6.5), 1);
    assert.equal(currentLine(lines, 100), 2);
  });
});
