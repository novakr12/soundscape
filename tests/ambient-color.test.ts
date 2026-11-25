import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractAmbientColor } from "../lib/ambient-color";

function solidPixels(count: number, r: number, g: number, b: number, a = 255) {
  const out = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return out;
}

function rgbChannels(hex: string) {
  assert.match(hex, /^#[0-9a-f]{6}$/);
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

describe("extractAmbientColor", () => {
  it("returns null for empty, transparent, or grayscale pixel buffers", () => {
    assert.equal(extractAmbientColor([]), null);
    assert.equal(extractAmbientColor(solidPixels(16, 230, 40, 40, 0)), null);
    assert.equal(extractAmbientColor(solidPixels(16, 128, 128, 128)), null);
    assert.equal(extractAmbientColor(solidPixels(16, 10, 12, 11)), null);
    assert.equal(extractAmbientColor(solidPixels(16, 250, 248, 249)), null);
  });

  it("extracts a balanced mid-tone hex matching dominant vibrant pixels", () => {
    const red = extractAmbientColor(solidPixels(16, 240, 40, 40));
    assert.ok(red);
    const [rr, rg, rb] = rgbChannels(red);
    assert.ok(rr > rg && rr > rb);

    const blue = extractAmbientColor(solidPixels(16, 30, 100, 245));
    assert.ok(blue);
    const [br, bg, bb] = rgbChannels(blue);
    assert.ok(bb > br && bb > bg);
  });

  it("ignores surrounding black/white pixels and picks the colorful accent region", () => {
    const mixed = new Uint8ClampedArray([
      ...solidPixels(40, 8, 8, 8),
      ...solidPixels(30, 246, 246, 246),
      ...solidPixels(12, 160, 70, 230),
    ]);
    const color = extractAmbientColor(mixed);
    assert.ok(color);
    const [r, g, b] = rgbChannels(color);
    assert.ok(b > g && r > g);
  });

  it("clamps extreme saturation and lightness into readable ambient bounds", () => {
    const paleGreen = extractAmbientColor(solidPixels(8, 210, 250, 215));
    assert.ok(paleGreen);
    const channels = rgbChannels(paleGreen);
    const max = Math.max(...channels) / 255;
    const min = Math.min(...channels) / 255;
    const lightness = (max + min) / 2;
    assert.ok(lightness >= 0.41 && lightness <= 0.57, `unexpected lightness ${lightness} for ${paleGreen}`);
  });
});
