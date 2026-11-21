import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSongId, mainArtist, songArtist, songTitle, trackIdFor } from "../lib/catalog";
import { shuffled } from "../lib/shuffle";

describe("songTitle", () => {
  for (const [title, expected] of [
    ["My High", "My High"],
    ["My High - Radio Edit", "My High"],
    ["My High (Edit)", "My High"],
    ["Bohemian Rhapsody - Remastered 2011", "Bohemian Rhapsody"],
    ["Let It Be (Remastered 2009)", "Let It Be"],
    ["Here Comes the Sun - 2019 Mix", "Here Comes the Sun - 2019 Mix"],
    ["Paint It Black (2002 Remaster)", "Paint It Black"],
    ["Creep [Explicit]", "Creep"],
    ["Creep (Clean Version)", "Creep"],
    ["Wonderwall (Mono)", "Wonderwall"],
    ["Get Lucky (feat. Pharrell Williams)", "Get Lucky"],
    ["Get Lucky feat. Pharrell Williams", "Get Lucky"],
    ["One Kiss (with Dua Lipa)", "One Kiss"],
    ["HUMBLE. (prod. Mike WiLL Made-It)", "HUMBLE."],
    ["Get Lucky (feat. Pharrell Williams) [Radio Edit]", "Get Lucky"],
    ["Get Lucky (feat. Pharrell Williams) - Remastered", "Get Lucky"],
  ]) {
    it(`"${title}" → "${expected}"`, () => assert.equal(songTitle(title), expected));
  }

  for (const title of [
    "My High (The Martinez Brothers Remix)",
    "Creep (Acoustic)",
    "Creep - Live at Glastonbury",
    "Dancing With Myself",
    "Prodigal Son",
    "Hey Jude (Instrumental)",
    "Rap God (Live)",
    "(I Can't Get No) Satisfaction",
    "Edit",
  ]) {
    it(`keeps "${title}" as its own song`, () => assert.equal(songTitle(title), title));
  }
});

describe("songArtist", () => {
  for (const [artist, expected] of [
    ["Radiohead", "Radiohead"],
    ["Calvin Harris feat. Dua Lipa", "Calvin Harris"],
    ["Daft Punk ft. Pharrell Williams", "Daft Punk"],
    ["Disclosure (feat. slowthai)", "Disclosure"],
    ["Simon & Garfunkel", "Simon & Garfunkel"],
    ["Earth, Wind & Fire", "Earth, Wind & Fire"],
    ["Disclosure & slowthai", "Disclosure & slowthai"],
  ]) {
    it(`"${artist}" → "${expected}"`, () => assert.equal(songArtist(artist), expected));
  }
});

describe("trackIdFor", () => {
  it("gives every version of the same recording one id", () => {
    const ids = new Set([
      trackIdFor("Disclosure", "My High"),
      trackIdFor("Disclosure", "My High - Radio Edit"),
      trackIdFor("Disclosure", "My High (Remastered 2020) [Explicit]"),
      trackIdFor("Disclosure feat. slowthai", "My High (feat. slowthai)"),
    ]);
    assert.deepEqual([...ids], ["disclosure-my-high"]);
  });

  it("keeps remixes and live versions apart", () => {
    assert.notEqual(trackIdFor("Disclosure", "My High (Remix)"), trackIdFor("Disclosure", "My High"));
    assert.notEqual(trackIdFor("Radiohead", "Creep - Live"), trackIdFor("Radiohead", "Creep"));
  });

  it("keeps old ids for plain titles", () => {
    assert.equal(trackIdFor("Radiohead", "Creep"), "radiohead-creep");
    assert.equal(trackIdFor("Beyoncé", "Don't Hurt Yourself"), "beyonce-dont-hurt-yourself");
  });

  it("keeps letters from every alphabet", () => {
    assert.equal(trackIdFor("山下達郎", "あしおと"), "山下達郎-あしおと");
    assert.notEqual(trackIdFor("山下達郎", "あしおと"), trackIdFor("大貫妙子", "あしおと"));
    assert.equal(trackIdFor("방탄소년단", "Dynamite"), "방탄소년단-dynamite");
    assert.equal(trackIdFor("ＹＥＬＬＯＷ", "ばか"), "yellow-ばか");
  });
});

describe("mainArtist and isSongId", () => {
  it("extracts the primary artist from collaborations", () => {
    assert.equal(mainArtist("Disclosure, Aminé, slowthai"), "Disclosure");
    assert.equal(mainArtist("Simon & Garfunkel"), "Simon");
    assert.equal(mainArtist("Artist x Other"), "Artist");
    assert.equal(mainArtist("Artist feat. Guest"), "Artist");
    assert.equal(mainArtist("Radiohead"), "Radiohead");
  });

  it("accepts safe song IDs and rejects invalid ones", () => {
    assert.equal(isSongId("song_123-abc"), true);
    assert.equal(isSongId(""), false);
    assert.equal(isSongId("../secret"), false);
    assert.equal(isSongId("a".repeat(65)), false);
  });
});

describe("shuffled", () => {
  it("returns a new array with the same elements without mutating input", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffled(input, () => 0);
    assert.deepEqual(input, [1, 2, 3, 4, 5]);
    assert.deepEqual(out, [2, 3, 4, 5, 1]);
  });
});
