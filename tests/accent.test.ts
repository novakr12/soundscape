import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCENT_PRESETS, paintAccent } from "../lib/accent";
import { ACCENT_SCRIPT, readOptions } from "../lib/player-options";

function root() {
  const set = new Map<string, string>();
  return {
    set,
    style: {
      setProperty: (name: string, value: string) => set.set(name, value),
      removeProperty: (name: string) => set.delete(name),
    },
  };
}

describe("accent", () => {
  it("picks the readable foreground for each accent", () => {
    assert.equal(paintAccent("#1db954", root()), "#000000");
    assert.equal(paintAccent("#eab308", root()), "#000000");
    assert.equal(paintAccent("#1e3a8a", root()), "#ffffff");
    assert.equal(paintAccent("#000000", root()), "#ffffff");
    assert.equal(paintAccent("#FFFFFF", root()), "#000000");
  });

  it("sets the variables and clears them for anything else", () => {
    const page = root();
    paintAccent("#3B82F6", page);
    assert.deepEqual([...page.set.keys()], ["--accent", "--accent-fg", "--brand-green", "--logo-start", "--logo-end"]);
    assert.equal(page.set.get("--accent"), "#3b82f6");
    assert.equal(page.set.get("--logo-end"), "#76a8f9");
    assert.equal(page.set.get("--logo-start"), "#2f68c5");
    assert.equal(paintAccent("#1db954", page), "#000000");
    assert.equal(page.set.size, 0);
    paintAccent("#3b82f6", page);
    assert.equal(paintAccent("red; color: blue", page), null);
    assert.equal(page.set.size, 0);
  });

  it("keeps only valid saved accents", () => {
    assert.equal(readOptions({ accent: "#8B5CF6" }).accent, "#8b5cf6");
    assert.equal(readOptions({ accent: "url(x)" }).accent, "#1db954");
    assert.ok(ACCENT_PRESETS.every((preset) => readOptions({ accent: preset.color }).accent === preset.color));
  });

  it("paints from storage before the page loads", () => {
    const page = root();
    const store = { "soundscape:player-options": JSON.stringify({ accent: "#ef4444" }) };
    new Function("localStorage", "document", ACCENT_SCRIPT)(
      { getItem: (key: string) => store[key as keyof typeof store] ?? null },
      { documentElement: page },
    );
    assert.equal(page.set.get("--accent"), "#ef4444");
  });
});
