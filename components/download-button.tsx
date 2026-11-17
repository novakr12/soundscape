"use client";

import { useEffect, useState } from "react";
import {
  ANDROID_EVENT,
  type AndroidApp,
  type DownloadRequest,
  type DownloadTrack,
  readAndroidApp,
  summarize,
} from "@/lib/app-downloads";

type AppWindow = Window & { soundscapeAndroid?: unknown; soundscapeDownloadRequests?: DownloadRequest[] };

function send(request: DownloadRequest) {
  const view = window as AppWindow;
  view.soundscapeDownloadRequests ??= [];
  view.soundscapeDownloadRequests.push(request);
}

export default function DownloadButton({ tracks, name }: { tracks: DownloadTrack[]; name: string }) {
  const [app, setApp] = useState<AndroidApp | null>(null);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    const view = window as AppWindow;
    const take = (value: unknown) => {
      const next = readAndroidApp(value);
      if (next) setApp(next);
    };
    take(view.soundscapeAndroid);
    const listener = (event: Event) => take((event as CustomEvent<unknown>).detail);
    window.addEventListener(ANDROID_EVENT, listener);
    return () => window.removeEventListener(ANDROID_EVENT, listener);
  }, []);

  if (!app || tracks.length === 0) return null;
  const summary = summarize(
    tracks.map((track) => track.trackId),
    app.downloads,
  );
  const all = summary.done === summary.total;
  const busy = summary.waiting > 0 || (asked && !all && summary.failed === 0);

  if (all) {
    return (
      <span className="download-state">
        <span className="muted">Downloaded ✓</span>
        <button
          type="button"
          className="secondary"
          aria-label={`Remove the download of ${name}`}
          onClick={() => {
            send({ do: "remove", trackIds: tracks.map((track) => track.trackId) });
            setAsked(false);
          }}
        >
          Remove
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      className="secondary"
      disabled={busy}
      aria-label={`Download ${name} to this phone`}
      onClick={() => {
        send({ do: "download", tracks });
        setAsked(true);
      }}
    >
      {busy
        ? `Downloading ${summary.done} of ${summary.total}…`
        : summary.failed > 0
          ? `Download again (${summary.failed} failed)`
          : summary.done > 0
            ? `Download the rest (${summary.total - summary.done})`
            : "Download"}
    </button>
  );
}
