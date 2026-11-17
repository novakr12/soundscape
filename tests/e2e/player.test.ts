import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { type Browser, chromium, type Page } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const USERNAME = `e2eplayer${Date.now().toString(36)}`;
const PASSWORD = "player-test-password";
const SONG_SECONDS = 40;
const RATE = 8000;

const SONGS = ["First Light", "Second Wind", "Third Rail"].map((title, index) => ({
  id: `e2e-song-${index + 1}`,
  title,
  artist: "Player Test Band",
  album: "Player Test Album",
  albumId: "e2e-album",
  coverArt: "e2e-album",
  track: index + 1,
  duration: SONG_SECONDS,
  genre: "Test Rock",
  replayGain: { trackGain: -6 - index, albumGain: -4, trackPeak: 0.9, albumPeak: 0.95 },
}));

function tone(seconds: number) {
  const samples = seconds * RATE;
  const audio = Buffer.alloc(44 + samples * 2);
  audio.write("RIFF", 0);
  audio.writeUInt32LE(36 + samples * 2, 4);
  audio.write("WAVEfmt ", 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(RATE, 24);
  audio.writeUInt32LE(RATE * 2, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write("data", 36);
  audio.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    audio.writeInt16LE(Math.round(3000 * Math.sin((2 * Math.PI * 440 * i) / RATE)), 44 + i * 2);
  return audio;
}

const AUDIO = tone(SONG_SECONDS);
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f80f0000010101005d5b0e8a0000000049454e44ae426082",
  "hex",
);

function answers(method: string, query: URLSearchParams): object {
  if (method === "getSong") {
    const song = SONGS.find((candidate) => candidate.id === query.get("id"));
    return song ? { song } : { status: "failed", error: { code: 70, message: "Not found" } };
  }
  if (method === "getLyricsBySongId" && query.get("id") === "e2e-song-1") {
    const line = Array.from({ length: 8 }, (_, i) => ({ start: i * 5000, value: `First Light line ${i + 1}` }));
    return { lyricsList: { structuredLyrics: [{ synced: true, offset: 0, line }] } };
  }
  if (method === "getLyricsBySongId") return { lyricsList: { structuredLyrics: [] } };
  if (method === "getAlbum")
    return { album: { id: "e2e-album", name: "Player Test Album", artist: "Player Test Band", song: SONGS } };
  if (method === "getRandomSongs") return { randomSongs: { song: [...SONGS].reverse() } };
  if (method === "getMusicFolders") return { musicFolders: { musicFolder: [{ id: 1, name: "music" }] } };
  if (method === "getPlaylists")
    return { playlists: { playlist: [{ id: "e2e-trip", name: "Road Trip", songCount: 0 }] } };
  if (method === "updatePlaylist" || method === "createPlaylist") {
    playlistCalls.push(
      `${method} ${query.get("playlistId") ?? query.get("name")} ${query.get("songIdToAdd") ?? query.get("songId")}`,
    );
  }
  if (method === "getAlbumList2") {
    return { albumList2: { album: [{ id: "e2e-album", name: "Player Test Album", artist: "Player Test Band" }] } };
  }
  if (method === "search3") {
    const words = (query.get("query") ?? "").toLowerCase().replaceAll('"', "").trim();
    const song = words ? SONGS.filter((candidate) => candidate.artist.toLowerCase().includes(words)) : [];
    return { searchResult3: Number(query.get("songCount") ?? "0") > 0 ? { song } : {} };
  }
  return {};
}

function fakeNavidrome() {
  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://navidrome");
    const method = url.pathname.replace("/rest/", "").replace(".view", "");
    if (method === "getCoverArt") {
      response.writeHead(200, { "content-type": "image/png", "content-length": PNG.length });
      response.end(PNG);
      return;
    }
    if (method === "stream") {
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Number(range[2]) : AUDIO.length - 1;
        response.writeHead(206, {
          "content-type": "audio/wav",
          "accept-ranges": "bytes",
          "content-range": `bytes ${start}-${end}/${AUDIO.length}`,
          "content-length": end - start + 1,
        });
        response.end(AUDIO.subarray(start, end + 1));
        return;
      }
      response.writeHead(200, {
        "content-type": "audio/wav",
        "accept-ranges": "bytes",
        "content-length": AUDIO.length,
      });
      response.end(AUDIO);
      return;
    }
    const body = { status: "ok", version: "1.16.1", ...answers(method, url.searchParams) };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ "subsonic-response": body }));
  });
}

const playlistCalls: string[] = [];
let navidrome: Server;
let browser: Browser;
let page: Page;
const problems: string[] = [];

function title() {
  return page.locator(".player .now-playing strong").textContent();
}

function audioState() {
  return page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>(".player audio");
    return audio ? { paused: audio.paused, time: audio.currentTime, duration: audio.duration } : null;
  });
}

async function waitForSong(name: string) {
  await page.waitForFunction(
    (expected) => {
      const audio = document.querySelector<HTMLAudioElement>(".player audio");
      const shown = document.querySelector(".player .now-playing strong")?.textContent ?? "";
      return shown.includes(expected) && audio && !audio.paused && audio.currentTime > 0;
    },
    name,
    { timeout: 30_000 },
  );
}

async function nearTheEnd(seconds: number) {
  await page.evaluate((left) => {
    const audio = document.querySelector<HTMLAudioElement>(".player audio");
    if (audio) audio.currentTime = audio.duration - left;
  }, seconds);
}

before(async () => {
  navidrome = fakeNavidrome();
  await new Promise<void>((resolve) => navidrome.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required"],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  page = await browser.newPage();
  page.on("pageerror", (error) => problems.push(`${page.url()}: ${error.message}`));
});

after(async () => {
  await browser?.close();
  navidrome?.close();
});

describe("player", () => {
  it("signs up and connects Navidrome", async () => {
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
    await page.goto(`${BASE_URL}/connect#navidrome-library`, { waitUntil: "domcontentloaded" });
    const form = page.locator("#navidrome-library form");
    await form.locator('input[name="url"]').fill(`http://127.0.0.1:${(navidrome.address() as AddressInfo).port}`);
    await form.locator('input[name="username"]').fill("e2e");
    await form.locator('input[name="password"]').fill("e2e");
    await form.locator('button[type="submit"]').click();
    await page.getByText("Disconnect Navidrome").waitFor({ timeout: 30_000 });
  });

  it("lists the album under never played before anything is played", async () => {
    await page.goto(`${BASE_URL}/music?unplayed=1`, { waitUntil: "domcontentloaded" });
    await page.getByText("1 album in your Navidrome you haven't played a song from yet").waitFor();
    assert.equal(await page.locator(".music-songs li").count(), SONGS.length);
  });

  it("plays a full song from an album and keeps the time moving", async () => {
    await page.goto(`${BASE_URL}/music?album=e2e-album`, { waitUntil: "domcontentloaded" });
    const listening = page.waitForResponse((response) => response.url().endsWith("/api/now-playing"), {
      timeout: 30_000,
    });
    await page.locator(".music-songs li").first().getByRole("button", { name: "▶ Play" }).click();
    await waitForSong("First Light");
    assert.equal((await listening).status(), 200);
    assert.doesNotMatch((await page.locator(".player .now-playing").textContent()) ?? "", /preview/i);
    await page.waitForFunction(
      () => {
        const shown = document.querySelector(".player-time")?.textContent;
        const seek = Number(document.querySelector<HTMLInputElement>(".player-seek input")?.value);
        return shown !== "0:00" && seek >= 2;
      },
      null,
      { timeout: 15_000 },
    );
  });

  it("shows the song as listening now on the profile", async () => {
    const profile = await page.request.get(`${BASE_URL}/u/${USERNAME}`);
    assert.match(await profile.text(), /First Light/);
  });

  it("counts the song as a play after half of it", async () => {
    const counted = await page.waitForResponse((response) => response.url().endsWith("/api/play"), { timeout: 45_000 });
    assert.ok(counted.ok(), `the play answered ${counted.status()}`);
    const unplayed = await page.request.get(`${BASE_URL}/music?unplayed=1`);
    assert.match(await unplayed.text(), /played something from every album/);
  });

  it("moves to the next song without a gap", async () => {
    await page.evaluate(`(() => {
      const state = { old: document.querySelector(".player audio"), endsAt: 0, gap: null };
      window.gapless = state;
      const watch = () => {
        const audio = document.querySelector(".player audio");
        if (audio !== state.old || audio.paused) return;
        state.endsAt = performance.now() + (audio.duration - audio.currentTime) * 1000;
        requestAnimationFrame(watch);
      };
      watch();
      document.addEventListener("playing", (event) => {
        if (event.target !== state.old && state.gap === null) state.gap = performance.now() - state.endsAt;
      }, true);
    })()`);
    await nearTheEnd(3);
    await waitForSong("Second Wind");
    const result = (await page.evaluate(
      `({ swapped: document.querySelector(".player audio") !== window.gapless.old, gap: window.gapless.gap })`,
    )) as { swapped: boolean; gap: number | null };
    assert.ok(result.swapped, "the next song should start on the second audio element");
    assert.ok(result.gap !== null && Math.abs(result.gap) < 400, `gap was ${result.gap} ms`);
  });

  it("answers the keyboard shortcuts", async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Space");
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>(".player audio")?.paused === true);
    await page.keyboard.press("Space");
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>(".player audio")?.paused === false);
    const before = (await audioState())?.time ?? 0;
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      (from) => (document.querySelector<HTMLAudioElement>(".player audio")?.currentTime ?? 0) >= from + 4,
      before,
    );
    await page.keyboard.press("Shift+ArrowRight");
    await waitForSong("Third Rail");
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>(".player audio");
      if (audio) audio.currentTime = 0;
    });
    await page.keyboard.press("Shift+ArrowLeft");
    await waitForSong("Second Wind");
  });

  it("lists the queue and jumps to a song in it", async () => {
    await page.locator('[data-player="queue"]').click();
    const rows = page.locator(".queue-panel .queue-song");
    await rows.first().waitFor();
    const shown = (await rows.allTextContents()).join(" | ");
    for (const song of SONGS) assert.match(shown, new RegExp(song.title));
    await rows.filter({ hasText: "Third Rail" }).click();
    await waitForSong("Third Rail");
    await page.locator('[data-player="queue"]').click();
  });

  it("keeps playing after the page reloads", async () => {
    await page.waitForFunction(() => (document.querySelector<HTMLAudioElement>(".player audio")?.currentTime ?? 0) > 1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForSong("Third Rail");
    assert.match((await title()) ?? "", /Third Rail/);
  });

  it("levels the volume with the album's ReplayGain and stops when turned off", async () => {
    const volume = () => page.evaluate(() => document.querySelector<HTMLAudioElement>(".player audio")?.volume ?? -1);
    const albumLevel = 10 ** (-4 / 20);
    await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
    await waitForSong("Third Rail");
    await page.waitForFunction((wanted) => {
      const audio = document.querySelector<HTMLAudioElement>(".player audio");
      return audio && Math.abs(audio.volume - wanted) < 0.01;
    }, 0.8 * albumLevel);
    const levelling = page.getByLabel("Level the volume between songs");
    await levelling.uncheck();
    await page.waitForFunction(
      () => Math.abs((document.querySelector<HTMLAudioElement>(".player audio")?.volume ?? 0) - 0.8) < 0.01,
    );
    await levelling.check();
    await page.waitForFunction((wanted) => {
      const audio = document.querySelector<HTMLAudioElement>(".player audio");
      return audio && Math.abs(audio.volume - wanted) < 0.01;
    }, 0.8 * albumLevel);
    assert.ok(Math.abs((await volume()) - 0.8 * albumLevel) < 0.01);
    const crossfade = page.getByLabel("Crossfade between songs");
    await crossfade.selectOption("6");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const select = [...document.querySelectorAll("label")]
        .find((label) => label.textContent?.startsWith("Crossfade"))
        ?.querySelector("select");
      return select?.value === "6";
    });
    await page.getByLabel("Crossfade between songs").selectOption("0");
  });

  it("starts a radio from a song", async () => {
    await page.goto(`${BASE_URL}/track/player-test-band-first-light`, { waitUntil: "load" });
    const started = page.waitForResponse((response) => response.url().endsWith("/api/radio"), { timeout: 30_000 });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Start radio"));
      return Boolean(button && Object.keys(button).some((key) => key.startsWith("__reactProps")));
    });
    await page.getByRole("button", { name: "📻 Start radio" }).click();
    assert.equal((await started).status(), 200);
    await waitForSong("First Light");
    await page.locator('[data-player="queue"]').click();
    const rows = page.locator(".queue-panel .queue-song");
    await rows.nth(2).waitFor();
    const shown = (await rows.allTextContents()).join(" | ");
    for (const song of SONGS) assert.match(shown, new RegExp(song.title));
    assert.equal(await rows.count(), SONGS.length);
    await page.locator('[data-player="queue"]').click();
  });

  it("stops after this song with the sleep timer", async () => {
    await page.locator('[data-player="sleep"]').click();
    await page.getByRole("button", { name: "In 15 minutes" }).click();
    await page.locator('[data-player="sleep"][aria-label="Stops in 15 minutes"]').waitFor();
    await page.locator('[data-player="sleep"]').click();
    await page.getByRole("button", { name: "Stop after this song" }).click();
    await page.locator('[data-player="sleep"][aria-label="Stops after this song"]').waitFor();
    const before = (await title()) ?? "";
    await nearTheEnd(2);
    await page.waitForFunction((playing) => {
      const audio = document.querySelector<HTMLAudioElement>(".player audio");
      const shown = document.querySelector(".player .now-playing strong")?.textContent ?? "";
      return shown !== playing && audio?.paused && audio.currentTime < 1;
    }, before);
    await page.locator('[data-player="sleep"][aria-label="Sleep timer"]').waitFor();
    const next = (await title()) ?? "";
    assert.ok(SONGS.some((song) => next.includes(song.title)) && next !== before);
    await page.locator('[data-player="play"]').click();
    await waitForSong(next);
  });

  it("adds a song to a Navidrome playlist", async () => {
    await page.goto(`${BASE_URL}/music?album=e2e-album`, { waitUntil: "domcontentloaded" });
    const row = page.locator(".music-songs li").nth(1);
    await row.getByLabel("More for Second Wind").click();
    await row.getByRole("button", { name: "Add to playlist…" }).click();
    await row.getByRole("button", { name: "Road Trip" }).click();
    await row.getByText("Added to Road Trip").waitFor();
    await row.getByLabel("More for Second Wind").click();
    await row.getByRole("button", { name: "Add to playlist…" }).click();
    await row.getByLabel("New playlist name").fill("Fresh Finds");
    await row.getByRole("button", { name: "Create" }).click();
    await row.getByText("Added to Fresh Finds").waitFor();
    assert.deepEqual(playlistCalls, ["updatePlaylist e2e-trip e2e-song-2", "createPlaylist Fresh Finds e2e-song-2"]);
  });

  it("shuffles the whole library, not just one page", async () => {
    const answer = await page.evaluate(async () => {
      const response = await fetch("/api/music/shuffle?library=1");
      return { status: response.status, body: await response.json() };
    });
    assert.equal(answer.status, 200);
    assert.deepEqual(
      answer.body.songs.map((song: { title: string }) => song.title).sort(),
      SONGS.map((song) => song.title).sort(),
    );
  });

  it("finds Navidrome songs in the search", async () => {
    await page.goto(`${BASE_URL}/search?q=${encodeURIComponent("Player Test Band")}`, {
      waitUntil: "domcontentloaded",
    });
    const section = page.locator("section", { has: page.getByRole("heading", { name: "In your Navidrome" }) });
    await section.waitFor();
    const shown = (await section.locator(".music-songs li").allTextContents()).join(" | ");
    for (const song of SONGS) assert.match(shown, new RegExp(song.title));
  });

  it("shows the lyrics in step with the song", async () => {
    await page.goto(`${BASE_URL}/music?album=e2e-album`, { waitUntil: "domcontentloaded" });
    await page.locator(".music-songs li").first().getByRole("button", { name: "▶ Play" }).click();
    await waitForSong("First Light");
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>(".player audio");
      if (audio) audio.currentTime = 11;
    });
    await page.locator('[data-player="lyrics"]').click();
    const panel = page.locator(".lyrics-panel");
    await panel.locator("li.current", { hasText: "First Light line 3" }).waitFor();
    assert.equal(await panel.locator(".lyrics li").count(), 8);
    assert.match((await panel.locator(".lyrics-source").textContent()) ?? "", /Navidrome/);
    await panel.getByRole("button", { name: "First Light line 6" }).click();
    await panel.locator("li.current", { hasText: "First Light line 6" }).waitFor();
    await page.locator('[data-player="lyrics"]').click();
    await panel.waitFor({ state: "detached" });
  });

  it("links the song titles in the music list to their pages", async () => {
    await page.goto(`${BASE_URL}/music?album=e2e-album`, { waitUntil: "domcontentloaded" });
    const title = page.locator(".music-song strong a", { hasText: "First Light" });
    await title.waitFor();
    assert.match((await title.getAttribute("href")) ?? "", /^\/track\//);
  });

  it("shows the album of a song played from the home page", async () => {
    await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
    const recent = page.locator("section", { hasText: "Recently played" }).locator(".play-controls > button").first();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("section .play-controls > button")].some((button) =>
        Object.keys(button).some((key) => key.startsWith("__reactProps")),
      ),
    );
    await recent.click();
    const album = page.locator(".player .now-playing a", { hasText: "Player Test Album" });
    await album.waitFor({ timeout: 20_000 });
    assert.match((await album.getAttribute("href")) ?? "", /^\/(album\/|music\?album=e2e-album$)/);
    const song = page.locator(".player .now-playing strong a");
    assert.match((await song.getAttribute("href")) ?? "", /^\/track\//);
  });

  it("pauses with the play button", async () => {
    await page.locator('[data-player="play"]').click();
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>(".player audio")?.paused === true);
  });

  it("saw no errors in the browser", () => {
    assert.deepEqual(problems, []);
  });
});
