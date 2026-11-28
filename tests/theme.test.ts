import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readOptions, THEME_SCRIPT } from "../lib/player-options";
import { paintTheme, syncThemeColor, THEME_MODES } from "../lib/theme";

function root(initial?: string) {
  const attrs = new Map<string, string>();
  if (initial !== undefined) attrs.set("data-theme", initial);
  return {
    attrs,
    setAttribute: (name: string, value: string) => attrs.set(name, value),
    removeAttribute: (name: string) => {
      attrs.delete(name);
    },
  };
}

describe("theme", () => {
  it("sets or clears data-theme on the document root", () => {
    const page = root();
    assert.equal(paintTheme("dark", page), "dark");
    assert.equal(page.attrs.get("data-theme"), "dark");
    assert.equal(paintTheme("light", page), "light");
    assert.equal(page.attrs.get("data-theme"), "light");
    assert.equal(paintTheme("system", page), "system");
    assert.equal(page.attrs.has("data-theme"), false);
    assert.equal(paintTheme("sepia", page), "system");
    assert.equal(page.attrs.has("data-theme"), false);
  });

  it("keeps only valid saved theme modes", () => {
    for (const mode of THEME_MODES) {
      assert.equal(readOptions({ theme: mode }).theme, mode);
    }
    assert.equal(readOptions({ theme: "auto" }).theme, "system");
    assert.equal(readOptions({ theme: 123 }).theme, "system");
    assert.equal(readOptions(null).theme, "system");
  });

  it("applies the saved theme from storage before the page loads", () => {
    const darkPage = root();
    const darkStore = { "soundscape:player-options": JSON.stringify({ theme: "dark" }) };
    new Function("localStorage", "document", THEME_SCRIPT)(
      { getItem: (key: string) => darkStore[key as keyof typeof darkStore] ?? null },
      { documentElement: darkPage },
    );
    assert.equal(darkPage.attrs.get("data-theme"), "dark");

    const systemPage = root("dark");
    const systemStore = { "soundscape:player-options": JSON.stringify({ theme: "system" }) };
    new Function("localStorage", "document", THEME_SCRIPT)(
      { getItem: (key: string) => systemStore[key as keyof typeof systemStore] ?? null },
      { documentElement: systemPage },
    );
    assert.equal(systemPage.attrs.has("data-theme"), false);
  });

  it("updates theme-color meta tags for light, dark, and system", () => {
    const lightMeta = { media: "(prefers-color-scheme: light)", content: "#ffffff" };
    const darkMeta = { media: "(prefers-color-scheme: dark)", content: "#111111" };
    const metas = [lightMeta, darkMeta].map((entry) => ({
      getAttribute: (name: string) => (name === "media" ? entry.media : entry.content),
      setAttribute: (name: string, value: string) => {
        if (name === "content") entry.content = value;
      },
    }));
    const doc = { querySelectorAll: () => metas };

    syncThemeColor("dark", doc);
    assert.equal(lightMeta.content, "#111111");
    assert.equal(darkMeta.content, "#111111");

    syncThemeColor("light", doc);
    assert.equal(lightMeta.content, "#ffffff");
    assert.equal(darkMeta.content, "#ffffff");

    syncThemeColor("system", doc);
    assert.equal(lightMeta.content, "#ffffff");
    assert.equal(darkMeta.content, "#111111");
  });
});
