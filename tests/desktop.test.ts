import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deviceName } from "../app/desktop/connect/device";
import { atLeast, desktopVersion } from "../components/app-version";
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

describe("notification text", () => {
  it("counts one play in the singular", async () => {
    const { notificationMessage } = await import("../lib/notifications");
    assert.equal(notificationMessage("listener", { kind: "milestone", count: 1 }).body, "You reached 1 play.");
    assert.equal(notificationMessage("listener", { kind: "milestone", count: 1000 }).body, "You reached 1,000 plays.");
  });
});

describe("desktopVersion", () => {
  it("only accepts a plain version number from the app", () => {
    assert.equal(desktopVersion("0.9.7"), "0.9.7");
    assert.equal(desktopVersion("1.10.0"), "1.10.0");
    assert.equal(desktopVersion(undefined), null);
    assert.equal(desktopVersion(true), null);
    assert.equal(desktopVersion("0.9"), null);
    assert.equal(desktopVersion("<b>1.0.0</b>"), null);
  });
});

describe("atLeast", () => {
  it("compares versions number by number", () => {
    assert.equal(atLeast("0.9.8", "0.9.8"), true);
    assert.equal(atLeast("0.9.10", "0.9.8"), true);
    assert.equal(atLeast("1.0.0", "0.9.8"), true);
    assert.equal(atLeast("0.9.7", "0.9.8"), false);
    assert.equal(atLeast(null, "0.9.8"), false);
  });
});
