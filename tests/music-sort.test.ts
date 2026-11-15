import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { libraryOrder, songOrder, sortChoices, sortSongs } from "../lib/music-sort";

const songs = [
  { title: "b song", artist: "Zed", album: "Last", duration: 300, track: 2 },
  { title: "A Song", artist: "alpha", album: "Middle", duration: 100, disc: 2, track: 1 },
  { title: "Song 10", artist: "Alpha", album: "Middle", duration: 200, track: 5 },
  { title: "Song 9", artist: "Beta", duration: 200 },
];

const titles = (list: typeof songs) => list.map((song) => song.title);

describe("sorting Music lists", () => {
  it("sorts by title, ignoring case and reading numbers as numbers", () => {
    assert.deepEqual(titles(sortSongs(songs, "title")), ["A Song", "b song", "Song 9", "Song 10"]);
  });

  it("sorts by artist, then album, then disc and track", () => {
    assert.deepEqual(titles(sortSongs(songs, "artist")), ["Song 10", "A Song", "Song 9", "b song"]);
  });

  it("sorts by album and puts songs without an album last", () => {
    assert.deepEqual(titles(sortSongs(songs, "album")), ["b song", "Song 10", "A Song", "Song 9"]);
  });

  it("sorts by length, keeping ties in title order", () => {
    assert.deepEqual(titles(sortSongs(songs, "length")), ["A Song", "Song 9", "Song 10", "b song"]);
  });

  it("keeps the original order when no sort is chosen, without changing the list", () => {
    const copy = [...songs];
    assert.equal(sortSongs(songs, null), songs);
    sortSongs(songs, "title");
    assert.deepEqual(songs, copy);
  });

  it("only accepts known sorts", () => {
    assert.equal(libraryOrder("added"), "added");
    assert.equal(libraryOrder("drop table"), "artist");
    assert.equal(libraryOrder(undefined), "artist");
    assert.equal(songOrder("album"), "album");
    assert.equal(songOrder("added"), null);
    assert.equal(sortChoices("playlist")[0].label, "Playlist order");
    assert.equal(sortChoices("search")[0].label, "Best match");
    assert.equal(sortChoices("library")[0].value, "artist");
  });
});
