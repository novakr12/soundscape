import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { highResArtwork, pickAppleCover, pickPreview } from "../lib/apple-preview";

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

describe("pickAppleCover", () => {
  it("upscales https artwork urls and rejects non-https ones", () => {
    assert.equal(
      highResArtwork("https://is1-ssl.mzstatic.com/image/thumb/Music124/cover/100x100bb.jpg"),
      "https://is1-ssl.mzstatic.com/image/thumb/Music124/cover/600x600bb.jpg",
    );
    assert.equal(highResArtwork("http://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg"), null);
    assert.equal(highResArtwork(undefined), null);
  });

  it("picks cover art for matching songs even without a 30-second preview", () => {
    const match = pickAppleCover(
      [
        {
          kind: "song",
          artistName: "Sleep",
          trackName: "Dopesmoker",
          collectionName: "Dopesmoker",
          artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Sleep/100x100bb.jpg",
          trackTimeMillis: 3812000,
        },
      ],
      "Sleep",
      "Dopesmoker",
    );
    assert.deepEqual(match, {
      cover: "https://is1-ssl.mzstatic.com/image/thumb/Sleep/600x600bb.jpg",
      album: "Dopesmoker",
      durationMs: 3812000,
    });
  });

  it("keeps playable preview url when present and falls back to album collections", () => {
    const withPreview = pickAppleCover(
      [
        {
          wrapperType: "track",
          kind: "song",
          artistName: "Sleep",
          trackName: "Sonic Titan",
          collectionName: "Dopesmoker",
          artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Titan/100x100bb.jpg",
          previewUrl: "https://audio.example/titan.m4a",
        },
      ],
      "Sleep",
      "Sonic Titan",
    );
    assert.equal(withPreview?.preview, "https://audio.example/titan.m4a");

    const albumFallback = pickAppleCover(
      [
        {
          wrapperType: "collection",
          artistName: "Sleep",
          collectionName: "Dopesmoker (Remastered)",
          artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Album/100x100bb.jpg",
        },
      ],
      "Sleep",
      "Unlisted Track",
      "Dopesmoker",
    );
    assert.deepEqual(albumFallback, {
      cover: "https://is1-ssl.mzstatic.com/image/thumb/Album/600x600bb.jpg",
      album: "Dopesmoker (Remastered)",
    });

    assert.equal(
      pickAppleCover(
        [
          {
            kind: "song",
            artistName: "Sleep",
            trackName: "Dopesmoker",
            artworkUrl100: "http://is1-ssl.mzstatic.com/image/thumb/Sleep/100x100bb.jpg",
          },
        ],
        "Sleep",
        "Dopesmoker",
      ),
      null,
    );
  });
});
