import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { type Browser, chromium, devices, type Page } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const USERNAME = process.env.E2E_USER ?? "e2eadmin";
const PASSWORD = "smoke-test-password";

const PAGES = [
  "/",
  "/feed",
  "/music",
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

  it("shows covers next to the songs played recently", async () => {
    await open("/");
    const rows = page.locator("section", { hasText: "Recently played" }).locator("li");
    await rows.first().waitFor();
    assert.equal(await rows.locator(".cover").count(), await rows.count());
  });

  it("shows the desktop app's version under the logo only inside the app", async () => {
    await open("/");
    assert.equal(await page.locator(".app-version").count(), 0);
    const context = await browser.newContext({ storageState: await page.context().storageState() });
    const inApp = await context.newPage();
    await inApp.addInitScript(() => {
      Object.defineProperty(window, "soundscapeDesktop", { value: true });
      Object.defineProperty(window, "soundscapeDesktopVersion", { value: "1.2.3" });
    });
    await inApp.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await inApp.locator(".lockup .app-version", { hasText: "v1.2.3" }).waitFor();
    await context.close();
  });

  it("shows the desktop app's settings on the Settings page only when the app sends them", async () => {
    await open("/settings");
    await page.getByRole("heading", { name: "Player" }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "This app" }).count(), 0);
    const settings = {
      connected: true,
      scrobbling: true,
      notifications: true,
      weekly_recap: false,
      streak_reminder: false,
      yearscape_notification: true,
      update_notice: true,
      discord: false,
      autostart: false,
      keep_running: true,
      native_player: true,
      discord_app_id: null,
      waiting: 3,
      listening: null,
      players: [{ id: "spotify", name: "Spotify", enabled: true, open: true }],
      paused_minutes: null,
      version: "9.9.9",
      update: null,
    };
    await page.waitForFunction(() =>
      [...document.querySelectorAll("h2")].some((heading) =>
        Object.keys(heading).some((key) => key.startsWith("__reactFiber")),
      ),
    );
    await page.evaluate(
      (detail) => {
        (window as Window & { soundscapeAppSettings?: unknown }).soundscapeAppSettings = detail;
        window.dispatchEvent(new CustomEvent("soundscape-app-settings", { detail }));
      },
      { settings, error: null },
    );
    await page.getByRole("heading", { name: "This app" }).waitFor();
    await page.getByText("3 plays waiting to be sent.").waitFor();
    const weekly = page.getByLabel("Sum up last week on Monday");
    assert.equal(await weekly.isChecked(), false);
    await weekly.check();
    await page.getByLabel("Spotify").uncheck();
    await page.getByRole("button", { name: "Send now" }).click();
    const sent = await page.evaluate(
      () => (window as Window & { soundscapeAppCommands?: unknown[] }).soundscapeAppCommands,
    );
    assert.deepEqual(sent, [
      { do: "option", name: "weekly_recap", value: true },
      { do: "player", id: "spotify", value: false },
      { do: "send-now" },
    ]);
    await page.evaluate(() => {
      (window as Window & { soundscapeAppCommands?: unknown[] }).soundscapeAppCommands = [];
      window.dispatchEvent(
        new CustomEvent("soundscape-app-settings", {
          detail: { settings: { version: "9.9.9" }, error: "Couldn't reach the server." },
        }),
      );
    });
    await page.getByRole("alert").filter({ hasText: "Couldn't reach the server." }).waitFor();
  });

  it("folds the links into a menu on a phone", async () => {
    const context = await browser.newContext({
      ...devices["Pixel 7"],
      storageState: await page.context().storageState(),
    });
    const phone = await context.newPage();
    await phone.goto(`${BASE_URL}/`, { waitUntil: "load" });
    const history = phone.locator("header nav").getByRole("link", { name: "History" });
    assert.equal(await history.isVisible(), false);
    const menu = phone.getByRole("button", { name: "Menu" });
    await phone.waitForFunction(() =>
      [...document.querySelectorAll("header button")].some((button) =>
        Object.keys(button).some((key) => key.startsWith("__reactProps")),
      ),
    );
    await menu.click();
    await history.click();
    await phone.waitForURL(/\/history$/);
    await phone.getByRole("button", { name: "Menu" }).waitFor();
    assert.equal(await history.isVisible(), false);
    await phone.getByRole("button", { name: "Search" }).click();
    await phone.getByRole("dialog", { name: "Find" }).waitFor();
    await context.close();
  });

  it("can be installed and shows a page when the server can't be reached", async () => {
    const context = await browser.newContext();
    const visitor = await context.newPage();
    await visitor.goto(`${BASE_URL}/`, { waitUntil: "load" });
    await visitor.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    const manifest = await (await visitor.request.get(`${BASE_URL}/manifest.webmanifest`)).json();
    assert.equal(manifest.display, "standalone");
    for (const icon of manifest.icons.filter((each: { type: string }) => each.type === "image/png")) {
      const image = await visitor.request.get(new URL(icon.src, BASE_URL).href);
      assert.equal(image.headers()["content-type"], "image/png", icon.src);
    }
    await visitor.reload({ waitUntil: "load" });
    await context.setOffline(true);
    await visitor.goto(`${BASE_URL}/charts`).catch(() => {});
    await visitor.getByRole("heading", { name: "You're offline" }).waitFor();
    await context.close();
  });

  it("opens the admin page", async () => {
    await open("/admin");
  });

  it("saw no errors in the browser", () => {
    assert.deepEqual(problems, []);
  });
});
