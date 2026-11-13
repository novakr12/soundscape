import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { type Browser, chromium, type Page } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const USERNAME = process.env.E2E_USER ?? "e2eadmin";
const PASSWORD = "smoke-test-password";

const PAGES = [
  "/",
  "/feed",
  "/history",
  "/charts",
  "/recommendations",
  "/mixes",
  "/stats",
  "/yearscape",
  "/import",
  "/export",
  "/connect",
  "/settings",
  "/notifications",
  `/u/${USERNAME}`,
  "/search?q=smoke",
];

let browser: Browser;
let page: Page;
const problems: string[] = [];

async function open(path: string) {
  const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  assert.ok(response, `${path} gave no response`);
  assert.ok(response.status() < 400, `${path} answered ${response.status()}`);
  await page.locator("h1").first().waitFor({ timeout: 30_000 });
  await page.waitForLoadState("load").catch(() => {});
  const body = (await page.locator("body").textContent()) ?? "";
  assert.doesNotMatch(body, /Application error|Internal Server Error|This page couldn.t load/i, path);
}

before(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  page = await browser.newPage();
  page.on("pageerror", (error) => problems.push(`${page.url()}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
      problems.push(`${page.url()}: ${message.text()}`);
    }
  });
});

after(async () => {
  await browser?.close();
});

describe("smoke test", () => {
  it("signs up and logs in", async () => {
    await page.goto(`${BASE_URL}/signup`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="username"]', USERNAME);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="username"]', USERNAME);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  });

  it("sends plays with a scrobbling token", async () => {
    await open("/connect");
    await page.fill('input[name="name"]', "Smoke test");
    await page.getByRole("button", { name: "Create token" }).click();
    await page.locator(".new-token code.token").waitFor({ timeout: 30_000 });
    const token = ((await page.locator(".new-token code.token").textContent()) ?? "").trim();
    const now = Math.floor(Date.now() / 1000);
    const payload = [1, 2, 3, 4, 5, 6].map((n) => ({
      listened_at: now - n * 300,
      track_metadata: { artist_name: `Smoke Artist ${n % 2}`, track_name: `Smoke Song ${n % 3}` },
    }));
    const response = await fetch(`${BASE_URL}/1/submit-listens`, {
      method: "POST",
      headers: { authorization: `Token ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ listen_type: "import", payload }),
    });
    assert.equal(response.status, 200, await response.text());

    await open("/connect");
    const row = page.locator("tr", { hasText: "Smoke test" }).first();
    assert.match((await row.textContent()) ?? "", /node/i);
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Revoke Smoke test" }).click();
    await row.waitFor({ state: "detached", timeout: 30_000 });
  });

  for (const path of PAGES) {
    it(`opens ${path}`, async () => {
      await open(path);
    });
  }

  it("opens an artist and a song from the history", async () => {
    await open("/history");
    await page.locator('a[href^="/artist/"]').first().click();
    await page.waitForURL(/\/artist\//);
    await open(new URL(page.url()).pathname);
    await open("/history");
    await page.locator('a[href^="/track/"]').first().click();
    await page.waitForURL(/\/track\//);
    await open(new URL(page.url()).pathname);
  });

  it("draws the now playing image and the Yearscape card", async () => {
    const nowPlaying = await page.request.get(`${BASE_URL}/u/${USERNAME}/now-playing.png`);
    assert.equal(nowPlaying.status(), 200);
    assert.equal(nowPlaying.headers()["content-type"], "image/png");
    const card = await page.request.get(`${BASE_URL}/yearscape/card`);
    assert.equal(card.status(), 200);
    assert.equal(card.headers()["content-type"], "image/png");
  });

  it("opens the admin page", async () => {
    await open("/admin");
  });

  it("saw no errors in the browser", () => {
    assert.deepEqual(problems, []);
  });
});
