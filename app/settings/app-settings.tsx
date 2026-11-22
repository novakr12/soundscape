"use client";

import { useEffect, useRef, useState } from "react";
import {
  type AndroidCommand,
  type AndroidPush,
  APP_SETTINGS_EVENT,
  type AppCommand,
  type AppOption,
  type AppPush,
  type AppSettings as AppSettingsView,
  type AppSong,
  KEEP_WINDOW_CHOICES,
  keepWindowLabel,
  MEMORY_LIMITS,
  readAndroidPush,
  readAppPush,
  scrobblingStatus,
  waitingStatus,
} from "@/lib/app-settings";

import AndroidSettings from "./android-settings";

type AppWindow = Window & {
  soundscapeAppSettings?: unknown;
  soundscapeAppCommands?: (AppCommand | AndroidCommand)[];
};

const SECTION = "this-app";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="app-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}
    </label>
  );
}

function FixForm({ playing, shown, send }: { playing: AppSong; shown: AppSong; send: (command: AppCommand) => void }) {
  const [artist, setArtist] = useState(shown.artist);
  const [title, setTitle] = useState(shown.title);
  const [every, setEvery] = useState(false);
  return (
    <form
      className="app-fix"
      onSubmit={(event) => {
        event.preventDefault();
        send({
          do: "add-fix",
          artist: playing.artist,
          title: playing.title,
          new_artist: artist,
          new_title: title,
          every_song: every,
        });
      }}
    >
      <p className="muted">
        Playing: {playing.artist} — {playing.title}
      </p>
      <label className="app-field">
        Artist
        <input
          type="text"
          value={artist}
          maxLength={300}
          required
          onChange={(event) => setArtist(event.target.value)}
        />
      </label>
      {!every && (
        <label className="app-field">
          Title
          <input type="text" value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} />
        </label>
      )}
      <Toggle label={`Fix every song by ${playing.artist}, not just this one`} checked={every} onChange={setEvery} />
      <button type="submit">Save fix</button>
    </form>
  );
}

function TitleFixes({ settings, send }: { settings: AppSettingsView; send: (command: AppCommand) => void }) {
  const playing = settings.playing;
  return (
    <>
      <h3>Title fixes</h3>
      <p className="muted">
        When a player sends a wrong or messy name, fix it once and the app sends the right one from now on. Plays
        already sent keep their old name.
      </p>
      {playing ? (
        <FixForm
          key={`${playing.artist}\n${playing.title}`}
          playing={playing}
          shown={settings.sent_as ?? playing}
          send={send}
        />
      ) : (
        <p className="muted">Play the song you want to fix and it shows up here.</p>
      )}
      {settings.fixes.length > 0 && (
        <ul className="app-fixes">
          {settings.fixes.map((fix, index) => (
            <li key={`${fix.from}→${fix.to}`} className="app-row">
              <span>
                {fix.from} → {fix.to}
              </span>
              <button type="button" className="secondary" onClick={() => send({ do: "remove-fix", index })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function AppSettings() {
  const [pushed, setPushed] = useState<AppPush | null>(null);
  const [android, setAndroid] = useState<AndroidPush | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [discordId, setDiscordId] = useState("");
  const typing = useRef(false);
  const scrolled = useRef(false);

  useEffect(() => {
    const view = window as AppWindow;
    const take = (value: unknown) => {
      const phone = readAndroidPush(value);
      if (phone) {
        if (phone.error) setMessage(phone.error);
        if ((view.soundscapeAppCommands?.length ?? 0) > 0) return;
        setAndroid(phone);
        return;
      }
      const next = readAppPush(value);
      if (!next) return;
      if (next.error) setMessage(next.error);
      if ((view.soundscapeAppCommands?.length ?? 0) > 0) return;
      setPushed(next);
      if (!typing.current) setDiscordId(next.settings.discord_app_id ?? "");
    };
    take(view.soundscapeAppSettings);
    const listener = (event: Event) => take((event as CustomEvent<unknown>).detail);
    window.addEventListener(APP_SETTINGS_EVENT, listener);
    return () => window.removeEventListener(APP_SETTINGS_EVENT, listener);
  }, []);

  useEffect(() => {
    if ((!pushed && !android) || scrolled.current) return;
    scrolled.current = true;
    if (window.location.hash === `#${SECTION}`) document.getElementById(SECTION)?.scrollIntoView();
  }, [pushed, android]);

  if (android) {
    return (
      <AndroidSettings
        pushed={android}
        message={message}
        send={(command) => {
          setMessage(null);
          const view = window as AppWindow;
          view.soundscapeAppCommands ??= [];
          view.soundscapeAppCommands.push(command);
        }}
        change={(name, value) =>
          setAndroid((before) => before && { ...before, settings: { ...before.settings, [name]: value } })
        }
      />
    );
  }
  if (!pushed) return null;
  const settings = pushed.settings;

  function send(command: AppCommand) {
    setMessage(null);
    const view = window as AppWindow;
    view.soundscapeAppCommands ??= [];
    view.soundscapeAppCommands.push(command);
  }

  function option(name: AppOption) {
    return (value: boolean) => {
      send({ do: "option", name, value });
      setPushed((before) => before && { ...before, settings: { ...before.settings, [name]: value } });
    };
  }

  const restart =
    (settings.cpu_rendering_now !== null && settings.cpu_rendering !== settings.cpu_rendering_now) ||
    (settings.faster_scripts_now !== null && settings.faster_scripts !== settings.faster_scripts_now);

  return (
    <section id={SECTION} className="app-settings">
      <h2>This app</h2>
      <p className="muted">
        Soundscape Desktop {settings.version} on this computer.
        {settings.update && ` Version ${settings.update} is out.`}{" "}
        {settings.update && (
          <button type="button" className="secondary" onClick={() => send({ do: "download" })}>
            Download
          </button>
        )}
      </p>

      <h3>Scrobbling</h3>
      <Toggle label="Send what you play to Soundscape" checked={settings.scrobbling} onChange={option("scrobbling")} />
      <div className="app-row">
        <span className="muted">{scrobblingStatus(settings)}</span>
        {settings.scrobbling && settings.connected && (
          <button type="button" className="secondary" onClick={() => send({ do: "pause" })}>
            {settings.paused_minutes ? "Resume now" : "Pause for an hour"}
          </button>
        )}
      </div>
      <div className="app-row">
        <span className="muted">{waitingStatus(settings.waiting)}</span>
        {settings.waiting > 0 && (
          <button type="button" className="secondary" onClick={() => send({ do: "send-now" })}>
            Send now
          </button>
        )}
      </div>

      <h3>Players</h3>
      <p className="muted">
        Browsers start off. When you turn one on, it only counts songs: videos titled &ldquo;Artist - Song&rdquo;, topic
        and VEVO channels, and music sites like YouTube Music.
      </p>
      {settings.players.length === 0 ? (
        <p className="muted">Start a music player and it shows up here.</p>
      ) : (
        <ul className="app-players">
          {settings.players.map((player) => (
            <li key={player.id}>
              <Toggle
                label={player.open ? player.name : `${player.name} (not open)`}
                checked={player.enabled}
                onChange={(value) => {
                  send({ do: "player", id: player.id, value });
                  setPushed(
                    (before) =>
                      before && {
                        ...before,
                        settings: {
                          ...before.settings,
                          players: before.settings.players.map((each) =>
                            each.id === player.id ? { ...each, enabled: value } : each,
                          ),
                        },
                      },
                  );
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <TitleFixes settings={settings} send={send} />

      <h3>Notifications</h3>
      <Toggle
        label="Show new followers, leaderboard passes and milestones"
        checked={settings.notifications}
        onChange={option("notifications")}
      />
      <Toggle label="Sum up last week on Monday" checked={settings.weekly_recap} onChange={option("weekly_recap")} />
      <Toggle
        label="Remind me at 21:00 if my streak is about to end"
        checked={settings.streak_reminder}
        onChange={option("streak_reminder")}
      />
      <Toggle
        label="Tell me in December when my Yearscape is ready"
        checked={settings.yearscape_notification}
        onChange={option("yearscape_notification")}
      />
      <Toggle
        label="Tell me when a new version of the app is out"
        checked={settings.update_notice}
        onChange={option("update_notice")}
      />
      <button type="button" className="secondary" onClick={() => send({ do: "test-notification" })}>
        Send a test notification
      </button>

      <h3>Discord</h3>
      <Toggle
        label="Show what I'm playing in my Discord status"
        checked={settings.discord}
        onChange={option("discord")}
      />
      <form
        className="app-row app-field-row"
        onSubmit={(event) => {
          event.preventDefault();
          typing.current = false;
          send({ do: "discord-app", id: discordId });
        }}
      >
        <label className="app-field">
          Discord application ID
          <input
            value={discordId}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="1234567890123456789"
            onFocus={() => {
              typing.current = true;
            }}
            onBlur={() => {
              typing.current = false;
            }}
            onChange={(event) => setDiscordId(event.target.value)}
          />
        </label>
        <button type="submit" className="secondary">
          Save
        </button>
      </form>
      <p className="muted">
        Discord shows the name of an application of your own: create one called &ldquo;Soundscape&rdquo; at
        discord.com/developers/applications and paste its Application ID here. Discord has to run on this computer.
      </p>

      <h3>Starting and closing</h3>
      <Toggle
        label="Start when you log in, without opening the window"
        checked={settings.autostart}
        onChange={option("autostart")}
      />
      <Toggle
        label="Keep running when the window is closed"
        checked={settings.keep_running}
        onChange={option("keep_running")}
      />
      {settings.keep_window !== null && settings.keep_running && (
        <>
          <label className="app-toggle">
            Keep the window ready after closing it{" "}
            <select
              value={settings.keep_window}
              onChange={(event) => {
                const seconds = Number(event.target.value);
                send({ do: "keep-window", seconds });
                setPushed((before) => before && { ...before, settings: { ...before.settings, keep_window: seconds } });
              }}
            >
              {KEEP_WINDOW_CHOICES.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {keepWindowLabel(seconds)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            While it&apos;s ready, opening the window again is instant. After that it closes completely to free about
            300 MB, and the next time it opens takes a few seconds. Music keeps playing either way.
          </p>
        </>
      )}
      <Toggle
        label="Play music with the app's own player, so it keeps going smoothly when you close the window and uses far less memory (applies after a restart)"
        checked={settings.native_player}
        onChange={option("native_player")}
      />

      {settings.cpu_rendering_now !== null && (
        <>
          <h3>Display</h3>
          <Toggle label="Enable CPU rendering" checked={settings.cpu_rendering} onChange={option("cpu_rendering")} />
          <p className="muted">
            Draws pages with the processor instead of the graphics card. Try it if pages draw wrongly or the app
            won&apos;t start.
          </p>
          {settings.faster_scripts_now !== null && (
            <>
              <Toggle label="Faster scripts" checked={settings.faster_scripts} onChange={option("faster_scripts")} />
              <p className="muted">
                Compiles the page&apos;s scripts so busy pages respond a little faster, at the cost of about 10 MB of
                memory.
              </p>
            </>
          )}
          {restart && (
            <div className="app-row">
              <span className="muted">Takes effect after a restart.</span>
              <button type="button" className="secondary" onClick={() => send({ do: "restart" })}>
                Restart now
              </button>
            </div>
          )}
          {settings.memory_limit !== null && (
            <>
              <label className="app-toggle">
                Free memory by loading pages fresh{" "}
                <select
                  value={settings.memory_limit}
                  onChange={(event) => {
                    const mb = Number(event.target.value);
                    send({ do: "memory-limit", mb });
                    setPushed((before) => before && { ...before, settings: { ...before.settings, memory_limit: mb } });
                  }}
                >
                  {MEMORY_LIMITS.map((mb) => (
                    <option key={mb} value={mb}>
                      {mb === 0 ? "Off" : `Above ${mb} MB`}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">
                Pictures and old page data build up until a page loads fresh. Above this, the next page you open loads
                fresh to free it. It waits while music plays in this window.
              </p>
            </>
          )}
          {settings.smooth_scrolling_known && (
            <>
              <Toggle
                label="Smooth scrolling"
                checked={settings.smooth_scrolling}
                onChange={option("smooth_scrolling")}
              />
              <p className="muted">Glides with each turn of the mouse wheel instead of jumping.</p>
            </>
          )}
        </>
      )}

      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}

      <h3>Account</h3>
      <div className="app-row">
        <span className="muted">
          {settings.connected && settings.user
            ? `Connected to ${settings.server ?? "Soundscape"} as ${settings.user}.`
            : `Not connected to ${settings.server ?? "a server"} yet.`}
        </span>
        <span>
          <button type="button" className="secondary" onClick={() => send({ do: "change-server" })}>
            Change server…
          </button>{" "}
          <button type="button" className="secondary" onClick={() => send({ do: "sign-out" })}>
            Sign out
          </button>
        </span>
      </div>
    </section>
  );
}
