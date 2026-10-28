import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { songArtist, songTitle, trackIdFor } from "../lib/catalog";

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
});
