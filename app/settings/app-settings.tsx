"use client";

import { useEffect, useRef, useState } from "react";
import {
  type AndroidCommand,
  type AndroidPush,
  APP_SETTINGS_EVENT,
  type AppCommand,
  type AppOption,
  type AppPush,
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
        className="app-row"
        onSubmit={(event) => {
          event.preventDefault();
          typing.current = false;
          send({ do: "discord-app", id: discordId });
        }}
      >
        <label>
          Discord application ID{" "}
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
      <Toggle
        label="When the window is closed, keep the music playing with the app's own player, which uses far less memory"
        checked={settings.native_player}
        onChange={option("native_player")}
      />

      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}

      <p className="muted app-more">
        Title fixes, changing the server and signing out the app are in its own settings window.{" "}
        <button type="button" className="secondary" onClick={() => send({ do: "window" })}>
          Open the app&apos;s settings window
        </button>
      </p>
    </section>
  );
}
