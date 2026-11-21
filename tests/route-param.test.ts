import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { trackIdFor } from "../lib/catalog";
import { routeParam } from "../lib/route-param";

describe("routeParam", () => {
  it("decodes ids from every alphabet", () => {
    assert.equal(routeParam("%E5%B1%B1%E4%B8%8B%E9%81%94%E9%83%8E"), "山下達郎");
    const id = trackIdFor("방탄소년단", "Dynamite");
    assert.equal(routeParam(encodeURIComponent(id)), id);
  });

  it("leaves plain and already-decoded ids alone", () => {
    assert.equal(routeParam("radiohead-creep"), "radiohead-creep");
    assert.equal(routeParam("山下達郎"), "山下達郎");
  });

  it("keeps a broken escape instead of throwing", () => {
    assert.equal(routeParam("%E5%B1"), "%E5%B1");
  });
});
