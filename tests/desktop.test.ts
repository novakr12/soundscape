import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deviceName } from "../app/desktop/connect/device";
import { safeNext } from "../lib/safe-next";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    assert.equal(safeNext("/desktop/connect?device=Laptop"), "/desktop/connect?device=Laptop");
    assert.equal(safeNext("/stats"), "/stats");
  });

  it("refuses anything that could leave the site", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "",
      5,
      null,
    ]) {
      assert.equal(safeNext(value), "/", String(value));
    }
    assert.equal(safeNext("//evil.example", ""), "");
  });
});

describe("deviceName", () => {
  it("cleans up the name the app sends", () => {
    assert.equal(deviceName("Linux desktop (Fedora 43)"), "Linux desktop (Fedora 43)");
    assert.equal(deviceName("  <b>Laptop</b>  "), "bLaptopb");
    assert.equal(deviceName(""), "Desktop app");
    assert.equal(deviceName(undefined), "Desktop app");
    assert.equal(deviceName("x".repeat(100)).length, 60);
  });
});
