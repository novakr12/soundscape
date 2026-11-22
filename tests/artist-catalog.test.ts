import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  artistSearchQueries,
  creditedIds,
  matchArtistAlbums,
  matchArtistSongs,
  matchesArtistRecord,
  matchesSongForArtist,
} from "../lib/artist-catalog";

describe("artistSearchQueries", () => {
  it("builds deduplicated plain and folded queries for ASCII, diacritics, and collab separators", () => {
    assert.deepEqual(artistSearchQueries("  Radiohead "), ["Radiohead"]);
    assert.deepEqual(artistSearchQueries("Yeat • Lil Uzi Vert"), ["Yeat • Lil Uzi Vert", "Yeat Lil Uzi Vert"]);
    assert.deepEqual(artistSearchQueries("Beyoncé • Jay‐Z"), [
      "Beyoncé • Jay‐Z",
      "Beyoncé Jay‐Z",
      "beyonce • jay‐z",
      "beyonce jay‐z",
    ]);
    assert.deepEqual(artistSearchQueries("Rosalía"), ["Rosalía", "rosalia"]);
  });
});

describe("artist matching helpers", () => {
  it("matches exact artist records and reordered collaborations without false positives", () => {
    assert.equal(matchesArtistRecord("Radiohead", "radiohead"), true);
    assert.equal(matchesArtistRecord("Yeat • Lil Uzi Vert", "Yeat & Lil Uzi Vert"), true);
    assert.equal(matchesArtistRecord("Yeat • Lil Uzi Vert", "Lil Uzi Vert, Yeat"), true);
    assert.equal(matchesArtistRecord("Yeat • Lil Uzi Vert", "Yeat"), false);
    assert.equal(matchesArtistRecord("Air", "Air Supply"), false);
    assert.equal(matchesArtistRecord("Air", "Air feat. Someone"), true);
  });

  it("extracts credited artists from artist strings and feat. titles", () => {
    const ids = creditedIds("Yeat", "Flawlëss (feat. Lil Uzi Vert)");
    assert.equal(ids.has("yeat"), true);
    assert.equal(ids.has("lil-uzi-vert"), true);

    const collabIds = creditedIds("Disclosure, Aminé & slowthai (prod. Someone)");
    assert.equal(collabIds.has("disclosure"), true);
    assert.equal(collabIds.has("amine"), true);
    assert.equal(collabIds.has("slowthai"), true);
  });

  it("matches solo songs and collab songs without leaking unrelated solo tracks", () => {
    assert.equal(matchesSongForArtist("Yeat", "Yeat feat. Lil Uzi Vert"), true);
    assert.equal(matchesSongForArtist("Yeat • Lil Uzi Vert", "Yeat", "Flawlëss (feat. Lil Uzi Vert)"), true);
    assert.equal(matchesSongForArtist("Yeat • Lil Uzi Vert", "Lil Uzi Vert & Yeat", "Flawlëss"), true);
    assert.equal(matchesSongForArtist("Yeat • Lil Uzi Vert", "Yeat", "Out thë way"), false);
    assert.equal(matchesSongForArtist("Air", "Air Supply", "All Out of Love"), false);
  });
});

describe("matchArtistAlbums", () => {
  it("deduplicates played vs unplayed albums, sorts extras by year desc then name, and maps hrefs", () => {
    const played = [
      { albumId: "yeat-lyfe", title: "Lyfë" },
      { albumId: "yeat-no-match", title: "Played Only" },
    ];
    const nav = [
      { id: "n-lyfe", name: "Lyfë", coverArt: "c-lyfe", year: 2022 },
      { id: "n-lyfe-deluxe-dup", name: "Lyfe", coverArt: "c-lyfe-2", year: 2022 },
      { id: "n-after", name: "AftërLyfe", coverArt: "c-after", year: 2023 },
      { id: "n-up", name: "Up 2 Më", year: 2021 },
      { id: "n-beta", name: "Beta" },
      { id: "n-alpha", name: "Alpha" },
    ];
    const result = matchArtistAlbums(played, nav);

    assert.equal(result.matched[0]?.id, "n-lyfe");
    assert.equal(result.matched[1], undefined);
    assert.deepEqual(
      result.extra.map((a) => a.id),
      ["n-after", "n-up", "n-alpha", "n-beta"],
    );
    assert.equal(result.albumHrefByNavId.get("n-lyfe"), "/album/yeat-lyfe");
    assert.equal(result.albumHrefByNavId.get("n-lyfe-deluxe-dup"), "/album/yeat-lyfe");
    assert.equal(result.albumHrefByNavId.get("n-after"), "/music?album=n-after");
    assert.equal(result.albumHrefByTitleSlug.get("lyfe"), "/album/yeat-lyfe");
    assert.equal(result.albumHrefByTitleSlug.get("afterlyfe"), "/music?album=n-after");
  });
});

describe("matchArtistSongs", () => {
  it("prefers album-matching Navidrome song, omits played titles from extras, and keeps cross-album duplicates", () => {
    const played = [{ title: "Flawlëss", album: "Lyfë" }];
    const nav = [
      { id: "s-single", title: "Flawlëss", artist: "Yeat • Lil Uzi Vert", album: "Single", albumId: "al-single" },
      { id: "s-lyfe", title: "Flawlëss", artist: "Yeat • Lil Uzi Vert", album: "Lyfë", albumId: "al-lyfe" },
      { id: "s-out", title: "Out thë way", artist: "Yeat", album: "Lyfë", albumId: "al-lyfe" },
      { id: "s-out-dup", title: "Out thë way (Explicit)", artist: "Yeat", album: "Lyfë", albumId: "al-lyfe" },
      { id: "s-out-live", title: "Out thë way", artist: "Yeat", album: "Live Set", albumId: "al-live" },
    ];
    const { matched, extra } = matchArtistSongs(played, nav);

    assert.equal(matched[0]?.id, "s-lyfe");
    assert.deepEqual(
      extra.map((s) => s.id),
      ["s-out", "s-out-live"],
    );
  });
});
