import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAndroidPush, readAppPush, scrobblingStatus, waitingStatus } from "../lib/app-settings";

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
  waiting: 2,
  listening: "Teardrop — Massive Attack (Spotify)",
  players: [
    { id: "spotify", name: "Spotify", enabled: true, open: true },
    { id: "firefox", name: "Firefox", enabled: false, open: false },
  ],
  paused_minutes: null,
  version: "0.9.9",
  update: null,
};

describe("readAppPush", () => {
  it("reads what the desktop app sends", () => {
    const pushed = readAppPush({ settings, error: null });
    assert.ok(pushed);
    assert.equal(pushed.settings.version, "0.9.9");
    assert.equal(pushed.settings.weekly_recap, false);
    assert.equal(pushed.settings.players.length, 2);
    assert.equal(pushed.error, null);
  });

  it("reads the CPU rendering switch only from apps that have it", () => {
    assert.equal(readAppPush({ settings, error: null })?.settings.cpu_rendering_now, null);
    const newer = readAppPush({
      settings: { ...settings, cpu_rendering: true, cpu_rendering_now: false },
      error: null,
    });
    assert.equal(newer?.settings.cpu_rendering, true);
    assert.equal(newer?.settings.cpu_rendering_now, false);
    assert.equal(newer?.settings.smooth_scrolling_known, false);
    const smoother = readAppPush({ settings: { ...settings, smooth_scrolling: false }, error: null });
    assert.equal(smoother?.settings.smooth_scrolling_known, true);
    assert.equal(smoother?.settings.smooth_scrolling, false);
  });

  it("reads the Servo app's own display settings, title fixes and account", () => {
    const valve = readAppPush({ settings: { ...settings, memory_limit: 500 }, error: null });
    assert.equal(valve?.settings.memory_limit, 500);
    assert.equal(readAppPush({ settings: { ...settings, memory_limit: 0 }, error: null })?.settings.memory_limit, 0);
    assert.equal(
      readAppPush({ settings: { ...settings, memory_limit: "lots" }, error: null })?.settings.memory_limit,
      null,
    );
    assert.equal(readAppPush({ settings, error: null })?.settings.faster_scripts_now, null);
    const scripts = readAppPush({
      settings: { ...settings, faster_scripts: true, faster_scripts_now: false },
      error: null,
    });
    assert.equal(scripts?.settings.faster_scripts, true);
    assert.equal(scripts?.settings.faster_scripts_now, false);
    const fixed = readAppPush({
      settings: {
        ...settings,
        server: "https://music.example.com",
        user: "sam",
        playing: { artist: "artist", title: "song (official video)" },
        sent_as: { artist: "Artist", title: "Song" },
        fixes: [{ from: "a — b", to: "A — B" }, { from: 3 }],
      },
      error: null,
    });
    assert.equal(fixed?.settings.user, "sam");
    assert.equal(fixed?.settings.server, "https://music.example.com");
    assert.deepEqual(fixed?.settings.playing, { artist: "artist", title: "song (official video)" });
    assert.deepEqual(fixed?.settings.sent_as, { artist: "Artist", title: "Song" });
    assert.deepEqual(fixed?.settings.fixes, [{ from: "a — b", to: "A — B" }]);
    const bare = readAppPush({ settings, error: null });
    assert.equal(bare?.settings.playing, null);
    assert.deepEqual(bare?.settings.fixes, []);
  });

  it("keeps an error to show", () => {
    assert.equal(readAppPush({ settings, error: "Couldn't reach the server." })?.error, "Couldn't reach the server.");
  });

  it("ignores anything that isn't the app's settings", () => {
    assert.equal(readAppPush(undefined), null);
    assert.equal(readAppPush({ settings: { ...settings, version: 3 } }), null);
    assert.equal(readAppPush("settings"), null);
  });

  it("drops odd values instead of trusting them", () => {
    const pushed = readAppPush({
      settings: { ...settings, scrobbling: "yes", waiting: -4, players: [{ id: 1 }, settings.players[0]] },
      error: 5,
    });
    assert.equal(pushed?.settings.scrobbling, false);
    assert.equal(pushed?.settings.waiting, 0);
    assert.deepEqual(pushed?.settings.players, [settings.players[0]]);
    assert.equal(pushed?.error, null);
  });
});

describe("app status lines", () => {
  it("says what scrobbling is doing", () => {
    const read = readAppPush({ settings, error: null });
    assert.ok(read);
    const base = read.settings;
    assert.equal(scrobblingStatus(base), "Listening now: Teardrop — Massive Attack (Spotify)");
    assert.equal(
      scrobblingStatus({ ...base, paused_minutes: 1 }),
      "Paused for 1 more minute. It turns back on by itself.",
    );
    assert.equal(scrobblingStatus({ ...base, scrobbling: false }), "Scrobbling is off.");
    assert.equal(scrobblingStatus({ ...base, listening: null }), "Nothing playing right now.");
  });

  it("counts the plays waiting", () => {
    assert.equal(waitingStatus(0), "No plays waiting to be sent.");
    assert.equal(waitingStatus(1), "1 play waiting to be sent.");
    assert.equal(waitingStatus(1200), "1,200 plays waiting to be sent.");
  });
});

describe("readAndroidPush", () => {
  const android = {
    app: "android",
    version: "0.4.0",
    connected: true,
    user: "ana",
    background_playback: true,
    notifications: true,
    notifications_allowed: false,
    downloads_wifi_only: true,
    downloads: "12 songs · 84 MB",
  };

  it("reads what the Android app sends", () => {
    const pushed = readAndroidPush({ settings: android, error: null });
    assert.equal(pushed?.settings.version, "0.4.0");
    assert.equal(pushed?.settings.user, "ana");
    assert.equal(pushed?.settings.notifications_allowed, false);
    assert.equal(pushed?.settings.downloads_wifi_only, true);
    assert.equal(pushed?.settings.downloads, "12 songs · 84 MB");
    assert.equal(pushed?.settings.extras, false);
    assert.equal(pushed?.settings.update, null);
  });

  it("reads the recap, streak and update switches from newer apps", () => {
    const pushed = readAndroidPush({
      settings: { ...android, weekly_recap: false, streak_reminder: true, update_notice: true, update: "0.7.0" },
      error: null,
    });
    assert.equal(pushed?.settings.extras, true);
    assert.equal(pushed?.settings.weekly_recap, false);
    assert.equal(pushed?.settings.streak_reminder, true);
    assert.equal(pushed?.settings.update_notice, true);
    assert.equal(pushed?.settings.update, "0.7.0");
  });

  it("keeps the desktop and Android sections apart", () => {
    assert.equal(readAppPush({ settings: android, error: null }), null);
    assert.equal(readAndroidPush({ settings: { ...android, app: "desktop" }, error: null }), null);
    assert.equal(readAndroidPush({ settings: { ...android, version: null } }), null);
  });
});
