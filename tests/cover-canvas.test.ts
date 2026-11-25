import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canvasPixels, centreCrop, drawsCoversOnCanvas, releaseCanvas } from "../lib/cover-canvas";

describe("covers drawn on a canvas", () => {
  it("draws at the screen's pixel density but never larger than the picture asked for", () => {
    assert.equal(canvasPixels(40, 1), 40);
    assert.equal(canvasPixels(40, 2), 80);
    assert.equal(canvasPixels(40, 3), 96);
    assert.equal(canvasPixels(48, 1.25), 60);
    assert.equal(canvasPixels(40, Number.NaN), 40);
    assert.equal(canvasPixels(40, 0), 40);
  });

  it("crops the middle of a picture that isn't square", () => {
    assert.deepEqual(centreCrop(300, 300), { x: 0, y: 0, width: 300, height: 300 });
    assert.deepEqual(centreCrop(400, 300), { x: 50, y: 0, width: 300, height: 300 });
    assert.deepEqual(centreCrop(300, 500), { x: 0, y: 100, width: 300, height: 300 });
  });

  it("draws covers on a canvas only in Servo, which never lets go of decoded pictures", () => {
    assert.ok(drawsCoversOnCanvas("Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Servo/0.8.0 Firefox/153.0"));
    assert.ok(!drawsCoversOnCanvas("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"));
    assert.ok(!drawsCoversOnCanvas("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36"));
    assert.ok(!drawsCoversOnCanvas(null));
  });

  it("shrinks released canvases through 1x1 before clearing to 0x0 so Servo drops their backing buffer", () => {
    const traceChanges = (initialWidth: number, initialHeight: number) => {
      const steps: Array<[number, number]> = [];
      let currentWidth = initialWidth;
      let currentHeight = initialHeight;
      const canvas = {
        get width() {
          return currentWidth;
        },
        set width(value: number) {
          currentWidth = value;
          steps.push([currentWidth, currentHeight]);
        },
        get height() {
          return currentHeight;
        },
        set height(value: number) {
          currentHeight = value;
          steps.push([currentWidth, currentHeight]);
        },
      };
      releaseCanvas(canvas);
      return steps;
    };

    assert.deepEqual(traceChanges(300, 300), [
      [1, 300],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
    assert.deepEqual(traceChanges(300, 1), [
      [1, 1],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
    assert.deepEqual(traceChanges(1, 300), [
      [1, 300],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
    assert.deepEqual(traceChanges(1, 1), [
      [0, 1],
      [0, 0],
    ]);
    assert.deepEqual(traceChanges(0, 0), [
      [0, 0],
      [0, 0],
    ]);
  });
});
