import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { findDeezerTrack, normalize } from "../lib/deezer";

type Song = { id: number; title: string; artist: string; album?: string };

function deezerReturns(resultsByQuery: Record<string, Song[]>) {
  return mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const query = new URL(String(input)).searchParams.get("q") ?? "";
    const data = (resultsByQuery[query] ?? []).map((song) => ({
      id: song.id,
      title: song.title,
      duration: 200,
      artist: { name: song.artist },
      album: { cover_medium: `cover-${song.id}`, title: song.album },
    }));
    return Response.json({ data });
  });
}

function queriesSent(fetchMock: ReturnType<typeof deezerReturns>) {
  return fetchMock.mock.calls.map((call) => new URL(String(call.arguments[0])).searchParams.get("q"));
}

afterEach(() => mock.restoreAll());

describe("findDeezerTrack", () => {
  it("returns the id, cover and length of an exact match", async () => {
    deezerReturns({ "Radiohead Creep": [{ id: 1, title: "Creep", artist: "Radiohead" }] });
    assert.deepEqual(await findDeezerTrack("Radiohead", "Creep"), {
      deezerId: 1,
      cover: "cover-1",
      durationMs: 200_000,
    });
  });

  it("returns the album the match comes from", async () => {
    deezerReturns({ "Radiohead Creep": [{ id: 1, title: "Creep", artist: "Radiohead", album: "Pablo Honey" }] });
    assert.equal((await findDeezerTrack("Radiohead", "Creep"))?.album, "Pablo Honey");
  });

  it("ignores songs with the same title by another artist", async () => {
    deezerReturns({ "Radiohead Creep": [{ id: 2, title: "Creep", artist: "Stone Temple Pilots" }] });
    assert.equal(await findDeezerTrack("Radiohead", "Creep"), null);
  });

  it("prefers the exact title over a longer version", async () => {
    deezerReturns({
      "Radiohead Creep": [
        { id: 3, title: "Creep (Acoustic)", artist: "Radiohead" },
        { id: 1, title: "Creep", artist: "Radiohead" },
      ],
    });
    assert.equal((await findDeezerTrack("Radiohead", "Creep"))?.deezerId, 1);
  });

  it("accepts a Deezer title that starts with the wanted title", async () => {
    deezerReturns({
      "Simon & Garfunkel The Sound of Silence": [
        { id: 4, title: "The Sound of Silence (Acoustic Version)", artist: "Simon & Garfunkel" },
      ],
    });
    assert.equal((await findDeezerTrack("Simon & Garfunkel", "The Sound of Silence"))?.deezerId, 4);
  });

  it("prefers the full artist name over the main artist", async () => {
    deezerReturns({
      "Simon & Garfunkel The Boxer": [
        { id: 5, title: "The Boxer", artist: "Simon" },
        { id: 6, title: "The Boxer", artist: "Simon & Garfunkel" },
      ],
    });
    assert.equal((await findDeezerTrack("Simon & Garfunkel", "The Boxer"))?.deezerId, 6);
  });

  it("falls back to the main artist when Deezer lists only them", async () => {
    deezerReturns({ "Disclosure & slowthai My High": [{ id: 7, title: "My High", artist: "Disclosure" }] });
    assert.equal((await findDeezerTrack("Disclosure & slowthai", "My High"))?.deezerId, 7);
  });

  it("searches again with only the main artist when the first search finds nothing", async () => {
    const fetchMock = deezerReturns({ "Disclosure My High": [{ id: 7, title: "My High", artist: "Disclosure" }] });
    assert.equal((await findDeezerTrack("Disclosure, Aminé, slowthai", "My High"))?.deezerId, 7);
    assert.deepEqual(queriesSent(fetchMock), ["Disclosure, Aminé, slowthai My High", "Disclosure My High"]);
  });

  for (const [title, cleaned] of [
    ["Get Lucky (feat. Pharrell Williams)", "Get Lucky"],
    ["Get Lucky ft. Pharrell Williams", "Get Lucky"],
    ["HUMBLE. (prod. Mike WiLL Made-It)", "HUMBLE."],
    ["HUMBLE. [Produced by Mike WiLL Made-It]", "HUMBLE."],
  ]) {
    it(`leaves out credits in "${title}"`, async () => {
      const fetchMock = deezerReturns({ [`Artist ${cleaned}`]: [{ id: 8, title: cleaned, artist: "Artist" }] });
      assert.equal((await findDeezerTrack("Artist", title))?.deezerId, 8);
      assert.deepEqual(queriesSent(fetchMock), [`Artist ${cleaned}`]);
    });
  }

  it("does not treat words starting with prod as a credit", async () => {
    const fetchMock = deezerReturns({ "Artist Prodigal Son": [{ id: 9, title: "Prodigal Son", artist: "Artist" }] });
    assert.equal((await findDeezerTrack("Artist", "Prodigal Son"))?.deezerId, 9);
    assert.deepEqual(queriesSent(fetchMock), ["Artist Prodigal Son"]);
  });

  for (const title of [
    "Bohemian Rhapsody - Remastered 2011",
    "Bohemian Rhapsody (Remastered 2011)",
    "Bohemian Rhapsody [Explicit]",
  ]) {
    it(`matches "${title}" to the plain song`, async () => {
      deezerReturns({ [`Queen ${title}`]: [{ id: 10, title: "Bohemian Rhapsody", artist: "Queen" }] });
      assert.equal((await findDeezerTrack("Queen", title))?.deezerId, 10);
    });
  }

  it("ignores accents, case and apostrophes", async () => {
    deezerReturns({ "beyonce dont hurt yourself": [{ id: 11, title: "Don't Hurt Yourself", artist: "Beyoncé" }] });
    assert.equal((await findDeezerTrack("beyonce", "dont hurt yourself"))?.deezerId, 11);
  });

  it("returns null after a single search when there is nothing to fall back to", async () => {
    const fetchMock = deezerReturns({});
    assert.equal(await findDeezerTrack("Nobody", "Nothing"), null);
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  it("throws when Deezer reports an error", async () => {
    mock.method(globalThis, "fetch", async () => Response.json({ error: { message: "Quota limit exceeded" } }));
    await assert.rejects(findDeezerTrack("Radiohead", "Creep"), /Quota limit exceeded/);
  });
});

describe("normalize", () => {
  it("drops accents instead of splitting words at them", () => {
    assert.equal(normalize("Björk"), normalize("Bjork"));
    assert.equal(normalize("Jóga"), "joga");
    assert.equal(normalize("Beyoncé"), "beyonce");
  });
});
