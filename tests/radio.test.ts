import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NavidromeSong } from "../lib/navidrome-library";
import { mainGenre, mixRadio } from "../lib/radio";

function songs(artist: string, count: number, genre?: string): NavidromeSong[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${artist}-${i}`,
    title: `${artist} song ${i}`,
    artist,
    ...(genre ? { genre } : {}),
  }));
}

const keep = () => 0.5;

describe("radio", () => {
  it("plays the chosen song first, then mostly other artists, never the same one close together", () => {
    const seed = songs("Seed", 10);
    const pools = ["A", "B", "C", "D", "E", "F", "G", "H"].map((artist) => songs(artist, 6));
    const mixed = mixRadio(seed, pools, { first: seed[3], exclude: new Set(), limit: 16, random: keep });
    assert.equal(mixed[0].id, "Seed-3");
    assert.equal(mixed.length, 16);
    assert.equal(new Set(mixed.map((song) => song.id)).size, 16);
    const artists = mixed.map((song) => song.artist);
    assert.ok(artists.filter((artist) => artist === "Seed").length <= 2);
    assert.ok(new Set(artists).size >= 8);
    for (let i = 0; i < artists.length; i++) {
      assert.ok(!artists.slice(Math.max(0, i - 4), i).includes(artists[i]), `${artists[i]} again at ${i}`);
    }
    for (const artist of new Set(artists)) {
      assert.ok(artists.filter((name) => name === artist).length <= 2, `${artist} more than twice`);
    }
  });

  it("skips songs already in the queue and the same song twice", () => {
    const twice: NavidromeSong[] = [
      { id: "x1", title: "Hit", artist: "Other" },
      { id: "x2", title: "Hit (Remastered)", artist: "Other" },
      { id: "x3", title: "Else", artist: "Other" },
    ];
    const mixed = mixRadio([], [twice], { exclude: new Set(["x3"]), limit: 10, random: keep });
    assert.equal(mixed.length, 1);
  });

  it("still plays something when only the artist is in the library", () => {
    const mixed = mixRadio(songs("Seed", 5), [], { exclude: new Set(), limit: 25, random: keep });
    assert.equal(mixed.length, 2);
  });

  it("gives nothing when the library has none of it", () => {
    assert.deepEqual(mixRadio([], [[]], { exclude: new Set(), limit: 25 }), []);
  });

  it("takes the genre most of the artist's songs share", () => {
    assert.equal(mainGenre([...songs("A", 3, "Black Metal"), ...songs("B", 1, "Metal")]), "Black Metal");
    assert.equal(mainGenre(songs("A", 2)), undefined);
  });
});
