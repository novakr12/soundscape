import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppleImportError, readAppleMusicFiles, readCsv } from "../lib/apple-music";

const ACTIVITY_HEADER =
  "﻿Album Name,Client IP Address,Event End Timestamp,Event Start Timestamp,Event Type,Media Type,Play Duration Milliseconds,Song Name";

const activity = (...rows: string[]) => ({
  name: "Apple Music Play Activity.csv",
  text: [ACTIVITY_HEADER, ...rows].join("\r\n"),
});

describe("readCsv", () => {
  it("reads quoted fields with commas, quotes and line breaks", () => {
    const rows: string[][] = [];
    readCsv('a,b\r\n"one, two","say ""hi""\nthere"\n\nlast,', (row) => rows.push(row));
    assert.deepEqual(rows, [
      ["a", "b"],
      ["one, two", 'say "hi"\nthere'],
      ["last", ""],
    ]);
  });
});

describe("readAppleMusicFiles", () => {
  it("takes artists from the daily tracks file when the activity file has none", () => {
    const history = readAppleMusicFiles([
      activity(
        "OK Computer,192.0.2.1,2024-03-11T15:54:02.000Z,2024-03-11T15:50:28.000Z,PLAY_END,AUDIO,214000,Karma Police",
        "Discovery,192.0.2.1,2024-03-11T16:00:00Z,2024-03-11T15:55:00Z,PLAY_END,AUDIO,300000,One More Time",
      ),
      {
        name: "Apple Music - Play History Daily Tracks.csv",
        text: "Country,Track Description,Date Played\nRS,Radiohead - Karma Police,20240311\nRS,Daft Punk - One More Time,20240311",
      },
    ]);
    assert.deepEqual(history.listens, [
      {
        artist: "Radiohead",
        title: "Karma Police",
        album: "OK Computer",
        playedAt: Date.parse("2024-03-11T15:50:28Z"),
      },
      { artist: "Daft Punk", title: "One More Time", album: "Discovery", playedAt: Date.parse("2024-03-11T15:55:00Z") },
    ]);
    assert.equal(JSON.stringify(history).includes("192.0.2.1"), false);
  });

  it("uses the artist column when there is one, and artists whose names contain a dash", () => {
    const history = readAppleMusicFiles([
      {
        name: "Apple Music Play Activity.csv",
        text: "Artist Name,Song Name,Event Start Timestamp,Play Duration Milliseconds\nRadiohead,Creep,2024-01-01 10:00:00,200000\n,Song,2024-01-01T11:00:00Z,200000",
      },
      {
        name: "Apple Music - Recently Played Tracks.csv",
        text: "Track Description,Container Album Name\nA - Ha - Song,X",
      },
    ]);
    assert.deepEqual(
      history.listens.map((listen) => [listen.artist, listen.title, listen.playedAt]),
      [
        ["Radiohead", "Creep", Date.parse("2024-01-01T10:00:00Z")],
        ["A - Ha", "Song", Date.parse("2024-01-01T11:00:00Z")],
      ],
    );
  });

  it("uses the album to tell apart artists with a song of the same name", () => {
    const history = readAppleMusicFiles([
      activity(
        "Pablo Honey,,,2024-01-01T10:00:00Z,PLAY_END,AUDIO,200000,Creep",
        "CrazySexyCool,,,2024-01-01T11:00:00Z,PLAY_END,AUDIO,200000,Creep",
        "Other,,,2024-01-01T12:00:00Z,PLAY_END,AUDIO,200000,Creep",
      ),
      {
        name: "Apple Music - Recently Played Tracks.csv",
        text: "Track Description,Container Album Name\nRadiohead - Creep,Pablo Honey\nTLC - Creep,CrazySexyCool",
      },
    ]);
    assert.deepEqual(
      history.listens.map((listen) => listen.artist),
      ["Radiohead", "TLC"],
    );
    assert.equal(history.noArtist, 1);
  });

  it("leaves out short plays, videos and lyrics, falls back to the end time and skips repeats", () => {
    const history = readAppleMusicFiles([
      activity(
        "A,,,2024-01-01T10:00:00Z,PLAY_END,AUDIO,29999,Short",
        "A,,,2024-01-01T10:01:00Z,PLAY_END,VIDEO,200000,Clip",
        "A,,,2024-01-01T10:02:00Z,LYRIC_DISPLAY,AUDIO,200000,Lyrics",
        "A,,2024-01-01T10:10:00Z,,PLAY_END,AUDIO,60000,Ending",
        "A,,2024-01-01T10:10:00Z,,PLAY_END,AUDIO,60000,Ending",
      ),
      { name: "daily.csv", text: "Track Description\nBand - Short\nBand - Clip\nBand - Lyrics\nBand - Ending" },
    ]);
    assert.deepEqual(history.listens, [
      { artist: "Band", title: "Ending", album: "A", playedAt: Date.parse("2024-01-01T10:09:00Z") },
    ]);
    assert.deepEqual([history.short, history.videos], [1, 1]);
  });

  it("explains which file is missing or wrong", () => {
    assert.throws(
      () => readAppleMusicFiles([{ name: "daily.csv", text: "Track Description\nA - B" }]),
      /Choose Apple Music Play Activity.csv too/,
    );
    assert.throws(
      () => readAppleMusicFiles([activity(), { name: "notes.csv", text: "a,b\n1,2" }]),
      (error) => error instanceof AppleImportError && /notes.csv isn't an Apple Music/.test(error.message),
    );
  });
});
