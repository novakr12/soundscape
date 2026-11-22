import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromReplayGain, gainLevel, playingAnAlbum, savedGain } from "../lib/levelling";
import { restoreQueue } from "../lib/play-queue";
import { readOptions } from "../lib/player-options";

describe("volume levelling", () => {
  it("reads ReplayGain from Navidrome and ignores nonsense", () => {
    assert.deepEqual(fromReplayGain({ trackGain: -7.5, albumGain: -6.2, trackPeak: 0.98, albumPeak: 1, baseGain: 0 }), {
      track: -7.5,
      album: -6.2,
      trackPeak: 0.98,
      albumPeak: 1,
    });
    assert.deepEqual(fromReplayGain({ trackGain: -3 }), { track: -3 });
    assert.equal(fromReplayGain({ trackPeak: 0.9 }), undefined);
    assert.equal(fromReplayGain({ trackGain: "loud", albumGain: 99 }), undefined);
    assert.equal(fromReplayGain(null), undefined);
    assert.deepEqual(savedGain({ track: -4, album: Number.NaN, trackPeak: -1 }), { track: -4 });
  });

  it("turns decibels into a volume level that never goes above full", () => {
    assert.equal(gainLevel(undefined, false), 1);
    assert.equal(gainLevel({ track: -6 }, false), 0.501);
    assert.equal(gainLevel({ track: -6, album: -3 }, true), 0.708);
    assert.equal(gainLevel({ track: -6 }, true), 0.501);
    assert.equal(gainLevel({ album: -3 }, false), 0.708);
    assert.equal(gainLevel({ track: 4 }, false), 1);
  });

  it("keeps a song from clipping using its peak", () => {
    assert.equal(gainLevel({ track: -1, trackPeak: 1.25 }, false), 0.8);
    assert.equal(gainLevel({ track: -6, album: -1, albumPeak: 1.6 }, true), 0.625);
  });

  it("uses album gain only while the songs around come from the same album", () => {
    const a = { artist: "Band", album: "One" };
    const b = { artist: "Band", album: "Two" };
    const other = { artist: "Other", album: "One" };
    assert.equal(playingAnAlbum([a, a, a], 1), true);
    assert.equal(playingAnAlbum([b, a, a], 0), false);
    assert.equal(playingAnAlbum([b, a, a], 1), true);
    assert.equal(playingAnAlbum([a, b, a], 1), false);
    assert.equal(playingAnAlbum([a, other], 0), false);
    assert.equal(playingAnAlbum([{ artist: "Band" }, { artist: "Band" }], 0), false);
    assert.equal(playingAnAlbum([a], 0), false);
  });

  it("keeps the gain when the queue is saved and restored", () => {
    const saved = restoreQueue({
      tracks: [
        { trackId: "t1", title: "One", artist: "A", gain: { track: -5, trackPeak: 0.9 } },
        { trackId: "t2", title: "Two", artist: "A", gain: { track: "x" } },
      ],
      order: [0, 1],
      position: 0,
    });
    assert.deepEqual(saved?.tracks[0].gain, { track: -5, trackPeak: 0.9 });
    assert.equal(saved?.tracks[1].gain, undefined);
  });

  it("levels by default, crossfades and autoplays only when asked and remembers all three", () => {
    assert.deepEqual(readOptions(null), {
      levelling: true,
      crossfade: 0,
      autoplay: false,
      visualizer: true,
      visualizerStyle: "bars",
      visualizerBounce: "lively",
      visualizerBars: 8,
      accent: "#1db954",
    });
    assert.deepEqual(
      readOptions({
        levelling: false,
        crossfade: 6,
        autoplay: true,
        visualizer: false,
        visualizerStyle: "wave",
        visualizerBounce: "extreme",
        visualizerBars: 12,
        accent: "#8b5cf6",
      }),
      {
        levelling: false,
        crossfade: 6,
        autoplay: true,
        visualizer: false,
        visualizerStyle: "wave",
        visualizerBounce: "extreme",
        visualizerBars: 12,
        accent: "#8b5cf6",
      },
    );
    assert.deepEqual(
      readOptions({
        levelling: "no",
        crossfade: 5,
        autoplay: "yes",
        visualizer: "off",
        visualizerStyle: "unknown",
        visualizerBounce: "wild",
        visualizerBars: 99,
        accent: "green",
      }),
      {
        levelling: true,
        crossfade: 0,
        autoplay: false,
        visualizer: true,
        visualizerStyle: "bars",
        visualizerBounce: "lively",
        visualizerBars: 8,
        accent: "#1db954",
      },
    );
  });
});
