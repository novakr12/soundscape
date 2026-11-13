import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickPreview } from "../lib/apple-preview";

const song = (artistName: string, trackName: string, previewUrl = `https://audio.example/${trackName}.m4a`) => ({
  kind: "song",
  artistName,
  trackName,
  previewUrl,
});

describe("pickPreview", () => {
  it("takes the song by the same artist with the same title", () => {
    const results = [
      song("Radiohead Tribute Band", "Weird Fishes / Arpeggi"),
      song("Radiohead", "Weird Fishes/Arpeggi", "https://audio.example/right.m4a"),
    ];
    assert.equal(pickPreview(results, "Radiohead", "Weird Fishes/Arpeggi"), "https://audio.example/right.m4a");
  });

  it("matches across accents, featured artists and edition notes", () => {
    assert.equal(pickPreview([song("Björk", "Jóga")], "Bjork", "Joga"), "https://audio.example/Jóga.m4a");
    assert.equal(
      pickPreview(
        [song("Daft Punk", "Get Lucky (feat. Pharrell Williams)")],
        "Daft Punk feat. Pharrell Williams",
        "Get Lucky",
      ),
      "https://audio.example/Get Lucky (feat. Pharrell Williams).m4a",
    );
    assert.equal(
      pickPreview([song("Radiohead", "Karma Police")], "Radiohead", "Karma Police (Remastered)"),
      "https://audio.example/Karma Police.m4a",
    );
  });

  it("leaves out other artists, videos and missing or unsafe previews", () => {
    assert.equal(pickPreview([song("Someone Else", "Creep")], "Radiohead", "Creep"), null);
    assert.equal(pickPreview([{ ...song("Radiohead", "Creep"), kind: "music-video" }], "Radiohead", "Creep"), null);
    assert.equal(pickPreview([{ ...song("Radiohead", "Creep"), previewUrl: undefined }], "Radiohead", "Creep"), null);
    assert.equal(
      pickPreview([song("Radiohead", "Creep", "http://audio.example/creep.m4a")], "Radiohead", "Creep"),
      null,
    );
  });
});
