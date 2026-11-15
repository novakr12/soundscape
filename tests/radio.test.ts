import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NavidromeSong } from "../lib/navidrome-library";
import { mixRadio } from "../lib/radio";

function songs(artist: string, count: number): NavidromeSong[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${artist}-${i}`, title: `${artist} song ${i}`, artist }));
}

const keep = () => 0.5;

describe("radio", () => {
  it("plays the chosen song first, then mixes the artist with similar ones", () => {
    const seed = songs("Seed", 6);
    const mixed = mixRadio(
      [
        { artistId: "seed", songs: seed },
        { artistId: "a", songs: songs("A", 4) },
        { artistId: "b", songs: songs("B", 4) },
      ],
      { first: seed[2], exclude: new Set(), limit: 9, random: keep },
    );
    assert.equal(mixed[0].id, "Seed-2");
    assert.equal(mixed.length, 9);
    assert.equal(new Set(mixed.map((song) => song.id)).size, 9);
    const artists = mixed.map((song) => song.artist);
    assert.ok(artists.filter((artist) => artist === "Seed").length >= 3);
    assert.ok(artists.includes("A") && artists.includes("B"));
    for (let i = 2; i < artists.length; i++) {
      assert.ok(!(artists[i] === artists[i - 1] && artists[i] === artists[i - 2]), `three in a row at ${i}`);
    }
  });

  it("skips songs already in the queue and the same song twice", () => {
    const twice: NavidromeSong[] = [
      { id: "x1", title: "Hit", artist: "Seed" },
      { id: "x2", title: "Hit (Remastered)", artist: "Seed" },
      { id: "x3", title: "Other", artist: "Seed" },
    ];
    const mixed = mixRadio([{ artistId: "seed", songs: twice }], { exclude: new Set(["x3"]), limit: 10, random: keep });
    assert.equal(mixed.length, 1);
  });

  it("keeps going with the artist alone when nothing similar is in the library", () => {
    const mixed = mixRadio(
      [
        { artistId: "seed", songs: songs("Seed", 5) },
        { artistId: "a", songs: [] },
      ],
      { exclude: new Set(), limit: 25, random: keep },
    );
    assert.equal(mixed.length, 5);
  });

  it("gives nothing when the library has none of it", () => {
    assert.deepEqual(mixRadio([{ artistId: "seed", songs: [] }], { exclude: new Set(), limit: 25 }), []);
  });
});
