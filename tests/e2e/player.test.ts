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

  it("tells the lock screen how far into the song it is", async () => {
    await page.evaluate(() => {
      const view = window as Window & { lockScreen?: MediaPositionState };
      navigator.mediaSession.setPositionState = (state) => {
        view.lockScreen = state;
      };
    });
    const state = await page.waitForFunction(
      () => {
        const shown = (window as Window & { lockScreen?: MediaPositionState }).lockScreen;
        return shown && (shown.position ?? 0) > 0 ? shown : null;
      },
      null,
      { timeout: 10_000 },
    );
    const told = (await state.jsonValue()) as MediaPositionState;
    assert.equal(Math.round(told.duration ?? 0), SONG_SECONDS);
    assert.equal(told.playbackRate, 1);
  });

  it("lets the Android app read and steer the player", async () => {
    type Bridge = {
      version: number;
      state: () => {
        tracks: { title: string; level: number }[];
        position: number;
        time: number;
        playing: boolean;
      } | null;
      command: (name: string, value?: number) => boolean;
      handBack: (state: unknown) => boolean;
    };
    const state = await page.evaluate(() =>
      (window as unknown as { soundscapePlayer: Bridge }).soundscapePlayer.state(),
    );
    assert.ok(state);
    assert.deepEqual(
      state.tracks.map((track) => track.title),
      SONGS.map((song) => song.title),
    );
    assert.equal(state.tracks[state.position].title, "First Light");
    assert.ok(state.playing);
    assert.ok(state.tracks.every((track) => track.level > 0 && track.level <= 1));
    assert.equal(
      await page.evaluate(() => (window as unknown as { soundscapePlayer: Bridge }).soundscapePlayer.command("pause")),
      true,
    );
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>(".player audio")?.paused === true);
    assert.equal(
      await page.evaluate(() =>
        (window as unknown as { soundscapePlayer: Bridge }).soundscapePlayer.handBack({ position: 99, time: 0 }),
      ),
      false,
    );
    assert.equal(
      await page.evaluate(() =>
        (window as unknown as { soundscapePlayer: Bridge }).soundscapePlayer.handBack({
          position: 0,
          time: 6,
          playing: true,
        }),
      ),
      true,
    );
    await waitForSong("First Light");
    const after = await page.evaluate(() =>
      (window as unknown as { soundscapePlayer: Bridge }).soundscapePlayer.state(),
    );
    assert.ok(after && after.time >= 5, `time ${after?.time}`);
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

  it("shows Play, not Pause, when the queue comes back without playing", async () => {
    await page.locator('[data-player="play"]').click();
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>(".player audio")?.paused === true);
    await page.reload({ waitUntil: "load" });
    await page.locator(".player .now-playing strong", { hasText: "Third Rail" }).waitFor();
    assert.equal(await page.locator('[data-player="play"]').getAttribute("aria-label"), "Play");
    await page.locator('[data-player="play"]').click();
    await waitForSong("Third Rail");
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

  it("finds a song with a typo in the quick finder and opens it", async () => {
    await page.goto(`${BASE_URL}/music`, { waitUntil: "load" });
    await page.waitForFunction(() =>
      [...document.querySelectorAll("header input[type=search]")].some((input) =>
        Object.keys(input).some((key) => key.startsWith("__reactProps")),
      ),
    );
    await page.keyboard.press("Control+k");
    const finder = page.getByRole("dialog", { name: "Find" });
    await finder.waitFor();
    await finder.getByRole("combobox").fill("First Ligt");
    const song = finder.getByRole("option", { name: /^First Light.*Song/ });
    await song.waitFor({ timeout: 15_000 });
    while ((await song.getAttribute("aria-selected")) !== "true") await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/track\//);
    assert.equal(await finder.isVisible(), false);
  });

  it("plays a song from the quick finder with Shift", async () => {
    await page.locator("header input[type=search]").click();
    const finder = page.getByRole("dialog", { name: "Find" });
    await finder.waitFor();
    await finder.getByRole("combobox").fill("First Light");
    const song = finder.getByRole("option", { name: /^First Light.*Song/ });
    await song.waitFor({ timeout: 15_000 });
    await song.click({ modifiers: ["Shift"] });
    await page.waitForFunction(() => {
      const audio = document.querySelector<HTMLAudioElement>(".player audio");
      const shown = document.querySelector(".player .now-playing strong")?.textContent ?? "";
      return (
        shown.includes("First Light") &&
        /\/api\/(listen|preview)\/player-test-band-first-light$/.test(audio?.currentSrc ?? "")
      );
    });
    assert.equal(await finder.isVisible(), false);
  });

  it("jumps to a page from the quick finder", async () => {
    await page.locator("h1").first().click();
    await page.keyboard.press("/");
    const finder = page.getByRole("dialog", { name: "Find" });
    await finder.waitFor();
    await page.keyboard.type("sett");
    await finder.getByRole("option", { name: /Settings.*Page$/, selected: true }).waitFor();
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/settings$/);
    await page.keyboard.press("Control+k");
    await finder.waitFor();
    await page.keyboard.press("Escape");
    await finder.waitFor({ state: "hidden" });
  });

  it("offers downloads only inside the Android app", async () => {
    await page.goto(`${BASE_URL}/music?album=e2e-album`, { waitUntil: "load" });
    await page.locator(".music-songs li").first().waitFor();
    assert.equal(await page.getByRole("button", { name: /^Download / }).count(), 0);
    const tell = (downloads: Record<string, string>) =>
      page.evaluate(
        (detail) => {
          (window as Window & { soundscapeAndroid?: unknown }).soundscapeAndroid = detail;
          window.dispatchEvent(new CustomEvent("soundscape-android", { detail }));
        },
        { version: "0.5.0", downloads },
      );
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".music-actions button")].some((button) =>
        Object.keys(button).some((key) => key.startsWith("__reactProps")),
      ),
    );
    await tell({});
    const download = page.getByRole("button", { name: "Download Player Test Album to this phone" });
    await download.click();
    const asked = (await page.evaluate(
      () => (window as Window & { soundscapeDownloadRequests?: unknown[] }).soundscapeDownloadRequests,
    )) as { do: string; tracks: { trackId: string; songId?: string; title: string }[] }[];
    assert.equal(asked.length, 1);
    assert.equal(asked[0].do, "download");
    assert.deepEqual(
      asked[0].tracks.map((track) => track.title),
      SONGS.map((song) => song.title),
    );
    assert.ok(asked[0].tracks.every((track) => track.songId?.startsWith("e2e-song-")));
    const ids = asked[0].tracks.map((track) => track.trackId);
    await tell({ [ids[0]]: "done", [ids[1]]: "waiting" });
    await page.getByText("Downloading 1 of 3…").waitFor();
    await tell(Object.fromEntries(ids.map((id) => [id, "done"])));
    await page.getByText("Downloaded ✓").waitFor();
    await page.getByRole("button", { name: "Remove the download of Player Test Album" }).click();
    const removed = (await page.evaluate(
      () => (window as Window & { soundscapeDownloadRequests?: unknown[] }).soundscapeDownloadRequests,
    )) as { do: string; trackIds?: string[] }[];
    assert.deepEqual(removed[1], { do: "remove", trackIds: ids });
  });

  it("pauses with the play button", async () => {
    await page.locator('[data-player="play"]').click();
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>(".player audio")?.paused === true);
  });

  it("controls this player from another device and moves the music there", async () => {
    const context = await browser.newContext();
    const other = await context.newPage();
    other.on("pageerror", (error) => problems.push(`other ${other.url()}: ${error.message}`));
    try {
      await page.goto(`${BASE_URL}/music?album=e2e-album`, { waitUntil: "domcontentloaded" });
      await page.locator(".music-songs li").first().getByRole("button", { name: "▶ Play" }).click();
      await waitForSong("First Light");
      const playing = (await title()) ?? "";
      const artistLink = page.locator(".player .now-playing").getByRole("link", { name: "Player Test Band" });
      assert.match((await artistLink.getAttribute("href")) ?? "", /^\/(artist\/|music\?q=)/);
      assert.equal(
        await page.locator(".player .now-playing").getByRole("link", { name: "Player Test Album" }).count(),
        1,
      );
      assert.ok(playing);
      await other.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
      await other.fill('input[name="username"]', USERNAME);
      await other.fill('input[name="password"]', PASSWORD);
      await other.click('button[type="submit"]');
      await other.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
      const elsewhere = other.locator(".playing-elsewhere");
      await elsewhere.waitFor({ timeout: 15_000 });
      assert.ok(((await elsewhere.textContent()) ?? "").startsWith(`Playing on Chrome on Linux · ${playing} · `));
      await elsewhere.click();
      const bar = other.locator(".remote-player");
      await bar.waitFor({ timeout: 10_000 });
      assert.equal(await bar.locator(".now-playing strong").textContent(), playing);
      assert.match((await bar.locator(".remote-where").textContent()) ?? "", /Playing on Chrome on Linux/);
      const pageAudio = (check: string) => page.waitForFunction(check, null, { timeout: 10_000 });
      await bar.getByRole("button", { name: "Pause on Chrome on Linux" }).click();
      await bar.getByRole("button", { name: "Play on Chrome on Linux" }).waitFor({ timeout: 2000 });
      await pageAudio('document.querySelector(".player audio")?.paused === true');
      await bar.getByRole("slider", { name: "Seek on Chrome on Linux" }).fill("20");
      await pageAudio('Math.abs((document.querySelector(".player audio")?.currentTime ?? 0) - 20) < 1.5');
      await bar.getByRole("slider", { name: "Volume on Chrome on Linux" }).fill("0.3");
      await pageAudio('localStorage.getItem("soundscape-volume")?.includes(\'"volume":0.3\') === true');
      await other.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await other.keyboard.press("Space");
      await pageAudio('document.querySelector(".player audio")?.paused === false');
      type Bridge = { soundscapePlayer: { state: () => unknown; command: (name: string) => boolean } };
      const seen = (await other.evaluate(() => {
        Object.assign(window, { soundscapeBridgeRemote: true });
        return (window as unknown as Bridge).soundscapePlayer.state();
      })) as { remote: { name: string }; tracks: { title: string }[]; playing: boolean };
      assert.equal(seen.remote.name, "Chrome on Linux");
      assert.equal(seen.tracks[0].title, playing);
      await other.waitForFunction(
        () => ((window as unknown as Bridge).soundscapePlayer.state() as { playing: boolean }).playing,
      );
      assert.equal(await other.evaluate(() => (window as unknown as Bridge).soundscapePlayer.command("pause")), true);
      await pageAudio('document.querySelector(".player audio")?.paused === true');
      assert.equal(
        await bar.getByRole("link", { name: "Player Test Band" }).getAttribute("href"),
        "/artist/player-test-band",
      );
      const saved = 'JSON.parse(localStorage.getItem("soundscape:player") ?? "{}")';
      await bar.getByRole("button", { name: "Shuffle on Chrome on Linux" }).click();
      await pageAudio(`${saved}.shuffle === true`);
      await bar.getByRole("button", { name: "Shuffle on Chrome on Linux", pressed: true }).waitFor({ timeout: 5000 });
      await bar.getByRole("button", { name: "Shuffle on Chrome on Linux" }).click();
      await pageAudio(`${saved}.shuffle === false`);
      await bar.getByRole("button", { name: "Repeat on Chrome on Linux: off" }).click();
      await pageAudio(`${saved}.repeat === "all"`);
      await bar.getByRole("button", { name: "Repeat on Chrome on Linux: all" }).click();
      await pageAudio(`${saved}.repeat === "one"`);
      await bar.getByRole("button", { name: "Repeat on Chrome on Linux: one" }).click();
      await pageAudio(`${saved}.repeat === "off"`);
      await bar.getByRole("button", { name: "Lyrics" }).click();
      await other.getByRole("region", { name: "Lyrics" }).getByText("First Light line 1").waitFor({ timeout: 10_000 });
      await other.getByRole("region", { name: "Lyrics" }).getByRole("button", { name: "Close" }).click();
      await bar.getByRole("button", { name: "Queue on Chrome on Linux" }).click();
      const remoteQueue = other.getByRole("region", { name: "Queue" });
      await remoteQueue.getByText("Queue on Chrome on Linux").waitFor();
      await remoteQueue.getByRole("button", { name: /Second Wind/ }).click();
      await page.waitForFunction(
        () => document.querySelector(".player .now-playing strong")?.textContent === "Second Wind",
        null,
        { timeout: 10_000 },
      );
      await bar.locator(".now-playing strong", { hasText: "Second Wind" }).waitFor({ timeout: 10_000 });
      await remoteQueue.getByRole("button", { name: "Close" }).click();
      await other.evaluate(() => {
        (window as unknown as { next: { router: { push: (href: string) => void } } }).next.router.push(
          "/music?album=e2e-album",
        );
      });
      await other.waitForURL((url) => url.searchParams.get("album") === "e2e-album");
      await bar.waitFor({ timeout: 5000 });
      await other.locator(".music-songs li").nth(1).getByRole("button", { name: "▶ Play" }).click();
      await page.waitForFunction(
        () => {
          const audio = document.querySelector<HTMLAudioElement>(".player audio");
          const shown = document.querySelector(".player .now-playing strong")?.textContent ?? "";
          return shown === "Second Wind" && audio && !audio.paused && audio.currentTime > 0;
        },
        null,
        { timeout: 30_000 },
      );
      await bar.locator(".now-playing strong", { hasText: "Second Wind" }).waitFor({ timeout: 10_000 });
      type Queue = { soundscapePlayer: { state: () => { tracks: { title: string }[]; position: number } } };
      const before = await page.evaluate(() => (window as unknown as Queue).soundscapePlayer.state().tracks.length);
      await other.getByLabel("More for First Light").first().click();
      await other.locator("details[open]").getByRole("button", { name: "Add to queue" }).click();
      await page.waitForFunction(
        (count) => {
          const tracks = (window as unknown as Queue).soundscapePlayer.state().tracks;
          return tracks.length === count + 1 && tracks[tracks.length - 1].title === "First Light";
        },
        before,
        { timeout: 10_000 },
      );
      assert.equal(await page.evaluate(() => document.querySelector<HTMLAudioElement>(".player audio")?.paused), false);
      assert.equal(
        await other.evaluate(() => Boolean(document.querySelector<HTMLAudioElement>(".player audio")?.paused ?? true)),
        true,
      );
      await bar.getByRole("button", { name: "Play here" }).click();
      await other.waitForFunction(
        (expected) => {
          const audio = document.querySelector<HTMLAudioElement>(".player audio");
          const shown = document.querySelector(".player .now-playing strong")?.textContent ?? "";
          return shown === expected && audio && !audio.paused && audio.currentTime > 0;
        },
        "Second Wind",
        { timeout: 30_000 },
      );
      await page.waitForFunction(() => document.querySelector<HTMLAudioElement>(".player audio")?.paused === true);
      await bar.waitFor({ state: "hidden", timeout: 5000 });
      const back = page.locator(".remote-player");
      await back.waitFor({ timeout: 10_000 });
      await back.locator(".now-playing strong", { hasText: "Second Wind" }).waitFor({ timeout: 10_000 });
      await back.getByRole("button", { name: "Pause on Chrome on Linux" }).click();
      await other.waitForFunction(
        () => document.querySelector<HTMLAudioElement>(".player audio")?.paused === true,
        null,
        {
          timeout: 10_000,
        },
      );
    } finally {
      await context.close();
    }
  });

  it("lets the Android app's own player speak for the phone while it plays", async () => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      Object.assign(window, { soundscapeDeviceId: "e2ephone00001", soundscapeDeviceName: "Soundscape on Test Phone" });
    });
    const phone = await context.newPage();
    phone.on("pageerror", (error) => problems.push(`phone ${phone.url()}: ${error.message}`));
    try {
      await phone.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
      await phone.fill('input[name="username"]', USERNAME);
      await phone.fill('input[name="password"]', PASSWORD);
      await phone.click('button[type="submit"]');
      await phone.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
      await page.locator('.player:not([hidden]) [data-player="devices"]').click();
      const panel = page.getByRole("region", { name: "Devices" });
      const entry = panel.locator('[data-device="e2ephone00001"]');
      await entry.getByText("Soundscape on Test Phone").waitFor({ timeout: 15_000 });
      await phone.evaluate(() => {
        Object.assign(window, { soundscapeDeviceHeld: true });
      });
      await entry.getByRole("button", { name: "Play my music there" }).click();
      await page.waitForTimeout(2000);
      assert.equal(
        await phone.evaluate(() => {
          const audio = document.querySelector<HTMLAudioElement>(".player audio");
          return Boolean(audio && !audio.paused);
        }),
        false,
      );
      await phone.evaluate(() => {
        Object.assign(window, { soundscapeDeviceHeld: false });
        window.dispatchEvent(new Event("soundscape-device-report"));
      });
      await phone.waitForFunction(
        () => {
          const audio = document.querySelector<HTMLAudioElement>(".player audio");
          return audio && !audio.paused && audio.currentTime > 0;
        },
        null,
        { timeout: 30_000 },
      );
      await entry.getByRole("button", { name: "Pause on Soundscape on Test Phone" }).click();
      await phone.waitForFunction(
        () => document.querySelector<HTMLAudioElement>(".player audio")?.paused === true,
        null,
        {
          timeout: 10_000,
        },
      );
      await panel.getByRole("button", { name: "Close" }).click();
    } finally {
      await context.close();
    }
  });

  it("saw no errors in the browser", () => {
    assert.deepEqual(problems, []);
  });
});
