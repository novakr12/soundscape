import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canvasPixels, centreCrop, drawsCoversOnCanvas } from "../lib/cover-canvas";

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
});
