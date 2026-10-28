import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readSpotifyHistory } from "../lib/spotify";

const song = (overrides: Record<string, unknown> = {}) => ({
  ts: "2024-03-11T15:50:28Z",
  ms_played: 214_000,
  ip_addr: "192.0.2.1",
  conn_country: "RS",
  master_metadata_track_name: "Karma Police",
  master_metadata_album_artist_name: "Radiohead",
  master_metadata_album_album_name: "OK Computer",
  episode_name: null,
  incognito_mode: false,
  ...overrides,
});

describe("readSpotifyHistory", () => {
  it("turns extended history entries into plays that start when the song started", () => {
    const history = readSpotifyHistory([song()]);
    assert.deepEqual(history.listens, [
      {
        artist: "Radiohead",
        title: "Karma Police",
        album: "OK Computer",
        playedAt: Date.parse("2024-03-11T15:50:28Z") - 214_000,
      },
    ]);
    assert.equal(JSON.stringify(history).includes("192.0.2.1"), false);
  });

  it("leaves out podcasts, short plays and private sessions", () => {
    const history = readSpotifyHistory([
      song(),
      song({ master_metadata_track_name: null, master_metadata_album_artist_name: null, episode_name: "Episode 1" }),
      song({ ms_played: 29_999 }),
      song({ incognito_mode: true }),
      null,
    ]);
    assert.equal(history.listens.length, 1);
    assert.deepEqual([history.podcasts, history.short, history.private], [1, 1, 1]);
  });

  it("reads the older account data format", () => {
    const history = readSpotifyHistory([
      { endTime: "2021-01-05 21:30", artistName: "Daft Punk", trackName: "One More Time", msPlayed: 320_000 },
      { endTime: "2021-01-05 21:31", artistName: "Daft Punk", trackName: "Skipped", msPlayed: 4_000 },
    ]);
    assert.deepEqual(history.listens, [
      { artist: "Daft Punk", title: "One More Time", playedAt: Date.parse("2021-01-05T21:30:00Z") - 320_000 },
    ]);
    assert.equal(history.short, 1);
  });

  it("refuses files that aren't a list of plays", () => {
    assert.throws(() => readSpotifyHistory({ some: "object" }), /isn't a Spotify streaming history file/);
  });
});
