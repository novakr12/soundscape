import assert from "node:assert/strict";
import { describe, it } from "node:test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

describe("Yearscape card", () => {
  it("is only made for the logged-in listener", async () => {
    const response = await fetch(`${BASE_URL}/yearscape/card?year=2025`);
    assert.equal(response.status, 401);
  });
});
