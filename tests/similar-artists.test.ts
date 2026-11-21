import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { listenBrainzSimilar } from "../lib/similar-artists";

const seed = "11111111-1111-1111-1111-111111111111";
let asked = "";
const server = createServer((request, response) => {
  asked = request.url ?? "";
  response.setHeader("content-type", "application/json");
  response.end(
    JSON.stringify({
      [seed]: [{ similar_artist_name: "Seed Artist" }],
      "22222222-2222-2222-2222-222222222222": [{ similar_artist_name: "細野晴臣" }],
      "33333333-3333-3333-3333-333333333333": [{ similar_artist_name: "大貫妙子" }],
      "44444444-4444-4444-4444-444444444444": [],
    }),
  );
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.LISTENBRAINZ_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/1`;
});

after(() => {
  server.close();
});

describe("similar artists", () => {
  it("reads the artists ListenBrainz finds similar, without the seed itself", async () => {
    const names = await listenBrainzSimilar(seed, 20);
    assert.deepEqual(names, ["細野晴臣", "大貫妙子"]);
    assert.match(asked, new RegExp(`^/1/lb-radio/artist/${seed}\\?`));
    assert.match(asked, /max_similar_artists=20/);
  });
});
