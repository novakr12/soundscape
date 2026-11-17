import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { finderPages, findPages, withoutRepeats } from "../lib/finder";
import { fold, fuzzyScore, fuzzySort } from "../lib/fuzzy";

describe("fuzzyScore", () => {
  it("matches letters in order, like a fuzzy finder", () => {
    assert.notEqual(fuzzyScore("stng", "Settings"), null);
    assert.notEqual(fuzzyScore("rcm", "Recommendations"), null);
    assert.equal(fuzzyScore("tsg", "Settings"), null);
    assert.equal(fuzzyScore("xyz", "Settings"), null);
  });

  it("likes the start of words and letters in a row", () => {
    const start = fuzzyScore("set", "Settings") ?? 0;
    const middle = fuzzyScore("set", "Reset the queue") ?? 0;
    assert.ok(start > middle);
    const together = fuzzyScore("stat", "Stats") ?? 0;
    const apart = fuzzyScore("stat", "Settings that matter") ?? 0;
    assert.ok(together > apart);
  });

  it("ignores case, accents and spaces", () => {
    assert.equal(fold("Björk Café"), "bjork cafe");
    assert.notEqual(fuzzyScore("bjork", "Björk"), null);
    assert.notEqual(fuzzyScore("your prof", "Your profile"), null);
    assert.equal(fuzzyScore("", "Anything"), 0);
  });
});

describe("fuzzySort", () => {
  it("puts the best match first and drops the rest", () => {
    const pages = ["Stats", "Settings", "Search", "Import"];
    assert.deepEqual(
      fuzzySort("st", pages, (page) => page),
      ["Stats", "Settings"],
    );
    assert.deepEqual(
      fuzzySort("sett", pages, (page) => page),
      ["Settings"],
    );
  });
});

describe("finderPages", () => {
  it("offers account pages only to someone logged in", () => {
    const visitor = finderPages(null, false).map((page) => page.label);
    assert.ok(visitor.includes("Log in"));
    assert.ok(!visitor.includes("Settings"));
    const member = finderPages("ana", false);
    assert.ok(member.some((page) => page.label === "Settings"));
    assert.equal(member.find((page) => page.label === "Your profile")?.href, "/u/ana");
    assert.ok(!member.some((page) => page.label === "Admin"));
    assert.ok(finderPages("ana", true).some((page) => page.label === "Admin"));
  });

  it("doesn't list a Navidrome song twice", () => {
    const songs = [{ trackId: "a-1", title: "One", artist: "A", plays: 3 }];
    const library = [
      { trackId: "a-1", title: "One", artist: "A" },
      { trackId: "a-2", title: "Two", artist: "A", newSong: true },
    ];
    assert.deepEqual(
      withoutRepeats(library, songs).map((song) => song.trackId),
      ["a-2"],
    );
  });
});

describe("findPages", () => {
  const pages = finderPages("ana", false);
  const labels = (query: string) => findPages(query, pages).map((page) => page.label);

  it("matches page names loosely", () => {
    assert.deepEqual(labels("set"), ["Settings"]);
    assert.equal(labels("stng")[0], "Settings");
    assert.equal(labels("rec")[0], "Recommendations");
  });

  it("finds a page by what's on it", () => {
    assert.deepEqual(labels("levelling"), ["Settings"]);
    assert.deepEqual(labels("lastfm"), ["Import"]);
    assert.deepEqual(labels("coer band"), []);
  });
});
