"use client";

import { atLeast, useDesktopVersion } from "@/components/app-version";

const OPENS_APP_SETTINGS = "0.9.8";

export default function AppSettingsNote() {
  const version = useDesktopVersion();
  if (!atLeast(version, OPENS_APP_SETTINGS)) return null;
  return (
    <section className="notice app-settings-note">
      <p>
        This page has your account and the player. Scrobbling, notifications, the Discord status and starting with your
        computer are in the app&apos;s own settings.
      </p>
      <button type="button" onClick={() => window.location.assign("soundscape-desktop://settings")}>
        Open app settings
      </button>
    </section>
  );
}
