"use client";

import { useState } from "react";
import { readSpotifyHistory, SPOTIFY_BATCH, type SpotifyListen } from "@/lib/spotify";
import { finishSpotifyImport, importSpotifyBatch } from "./actions";

type Status =
  | { phase: "idle" }
  | { phase: "reading"; file: string }
  | { phase: "importing"; done: number; total: number; imported: number }
  | { phase: "done"; imported: number; skipped: number; podcasts: number; short: number; private: number }
  | { phase: "error"; message: string };

function count(value: number, word: string) {
  return `${value.toLocaleString("en")} ${word}${value === 1 ? "" : "s"}`;
}

export default function SpotifyForm() {
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const busy = status.phase === "reading" || status.phase === "importing";

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = [...((event.currentTarget.elements.namedItem("files") as HTMLInputElement).files ?? [])];
    if (files.length === 0) return;

    const listens: SpotifyListen[] = [];
    const ignored = { podcasts: 0, short: 0, private: 0 };
    for (const file of files) {
      setStatus({ phase: "reading", file: file.name });
      try {
        const history = readSpotifyHistory(JSON.parse(await file.text()));
        listens.push(...history.listens);
        ignored.podcasts += history.podcasts;
        ignored.short += history.short;
        ignored.private += history.private;
      } catch {
        setStatus({ phase: "error", message: `${file.name} isn't a Spotify streaming history file.` });
        return;
      }
    }
    listens.sort((a, b) => a.playedAt - b.playedAt);

    let imported = 0;
    let skipped = 0;
    for (let start = 0; start < listens.length; start += SPOTIFY_BATCH) {
      setStatus({ phase: "importing", done: start, total: listens.length, imported });
      const result = await importSpotifyBatch(listens.slice(start, start + SPOTIFY_BATCH));
      if (result.error) {
        setStatus({ phase: "error", message: `${result.error} ${count(imported, "play")} were imported before that.` });
        return;
      }
      imported += result.imported;
      skipped += result.skipped;
    }
    await finishSpotifyImport();
    setStatus({ phase: "done", imported, skipped, ...ignored });
  }

  return (
    <form onSubmit={upload} className="stack">
      <label>
        Streaming history files
        <input name="files" type="file" accept=".json,application/json" multiple required disabled={busy} />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Importing…" : "Import from Spotify"}
      </button>
      <div aria-live="polite">
        {status.phase === "reading" && <p>Reading {status.file}…</p>}
        {status.phase === "importing" && (
          <div className="cover-status">
            <p>
              Importing {count(status.total, "play")}: {status.done.toLocaleString("en")} done,{" "}
              {status.imported.toLocaleString("en")} new so far.
            </p>
            <span className="progress-bar" aria-hidden="true">
              <span style={{ width: `${(status.done / Math.max(1, status.total)) * 100}%` }} />
            </span>
            <p className="muted">Keep this page open until it finishes.</p>
          </div>
        )}
        {status.phase === "done" && (
          <>
            <p>
              Imported {count(status.imported, "play")}.
              {status.skipped > 0 && ` Skipped ${count(status.skipped, "play")} you already had.`}
            </p>
            <p className="muted">
              Left out: {count(status.short, "play")} under 30 seconds,{" "}
              {count(status.podcasts, "podcast or audiobook episode")}
              {status.private > 0 && ` and ${count(status.private, "play")} from private sessions`}.
            </p>
          </>
        )}
        {status.phase === "error" && <p className="error">{status.message}</p>}
      </div>
    </form>
  );
}
