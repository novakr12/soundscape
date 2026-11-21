"use client";

import { useEffect, useRef, useState } from "react";
import type { AndroidCommand, AndroidOption, AndroidPush } from "@/lib/app-settings";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="app-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}
    </label>
  );
}

export default function AndroidSettings({
  pushed,
  message,
  send,
  change,
}: {
  pushed: AndroidPush;
  message: string | null;
  send: (command: AndroidCommand) => void;
  change: (name: AndroidOption, value: boolean) => void;
}) {
  const settings = pushed.settings;
  const [discordId, setDiscordId] = useState(settings.discord_app_id ?? "");
  const typing = useRef(false);

  useEffect(() => {
    if (!typing.current) setDiscordId(settings.discord_app_id ?? "");
  }, [settings.discord_app_id]);

  const option = (name: AndroidOption) => (value: boolean) => {
    send({ do: "option", name, value });
    change(name, value);
  };

  return (
    <section id="this-app" className="app-settings">
      <h2>This app</h2>
      <p className="muted">Soundscape for Android {settings.version} on this phone.</p>
      {settings.update && (
        <div className="app-row">
          <span>Version {settings.update} is out.</span>
          <button type="button" onClick={() => send({ do: "download-update" })}>
            Download
          </button>
        </div>
      )}

      <h3>Connection</h3>
      {settings.connected ? (
        <p>
          Connected as <strong>{settings.user}</strong>. The app has its own token, which you can see on the Connect
          page.
        </p>
      ) : (
        <p className="muted">
          Not connected. Connecting gives the app its own token, so it can keep playing when you leave it and show your
          notifications.
        </p>
      )}
      <div className="app-row app-buttons">
        {settings.connected ? (
          <button type="button" className="secondary" onClick={() => send({ do: "disconnect" })}>
            Disconnect
          </button>
        ) : (
          <button type="button" onClick={() => send({ do: "connect" })}>
            Connect this app
          </button>
        )}
        <button type="button" className="secondary" onClick={() => send({ do: "change-server" })}>
          Change server…
        </button>
      </div>

      <h3>Playback</h3>
      <Toggle
        label="When you leave the app, keep the music playing with Android's own player"
        checked={settings.background_playback}
        onChange={option("background_playback")}
      />
      <p className="muted">
        It picks up from the same song and second, pauses for calls and keeps going with the screen off. Off, the page
        keeps playing on its own, as in a browser.
        {!settings.connected && " Needs the app to be connected."}
      </p>

      <h3>Downloads</h3>
      <div className="app-row">
        <span className="muted">{settings.downloads ?? "Nothing downloaded yet."}</span>
        <button type="button" className="secondary" onClick={() => send({ do: "open-downloads" })}>
          Manage downloads
        </button>
      </div>
      <Toggle
        label="Download only on Wi-Fi"
        checked={settings.downloads_wifi_only}
        onChange={option("downloads_wifi_only")}
      />
      <p className="muted">
        Download albums and playlists from their pages in the app. Downloaded songs play without a connection, and
        without using mobile data when you're online.
      </p>

      <h3>Notifications</h3>
      <Toggle
        label="Show new followers, leaderboard passes, milestones and new releases"
        checked={settings.notifications}
        onChange={option("notifications")}
      />
      {settings.notifications && !settings.notifications_allowed && (
        <div className="app-row">
          <span className="muted">Android isn't allowing Soundscape to show notifications.</span>
          <button type="button" className="secondary" onClick={() => send({ do: "notification-settings" })}>
            Open Android settings
          </button>
        </div>
      )}
      {settings.extras && (
        <>
          <Toggle
            label="Your week in music, on Monday"
            checked={settings.weekly_recap}
            onChange={option("weekly_recap")}
          />
          <Toggle
            label="Remind me at 9 pm when my streak is about to end"
            checked={settings.streak_reminder}
            onChange={option("streak_reminder")}
          />
        </>
      )}
      <p className="muted">
        The app checks every 15 minutes while the phone is online.
        {!settings.connected && " Needs the app to be connected."}
      </p>

      {settings.discord_known && (
        <>
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
            discord.com/developers/applications and paste its Application ID here. Discord has to be installed and
            signed in on this phone.
          </p>
        </>
      )}

      {settings.extras && (
        <>
          <h3>Updates</h3>
          <Toggle
            label="Tell me when a new version of the app is out"
            checked={settings.update_notice}
            onChange={option("update_notice")}
          />
          <p className="muted">The app looks for a new release on GitHub once a day.</p>
        </>
      )}

      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}
