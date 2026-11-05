"use client";

import { useState } from "react";
import { readAppleMusicFiles } from "@/lib/apple-music";
import { FILE_BATCH, type FileListen } from "@/lib/file-import";
import { readSpotifyHistory } from "@/lib/spotify";
import { finishFileImport, importFileBatch } from "./actions";

type Source = "spotify" | "apple";
type Read = { listens: FileListen[]; leftOut: string[] };

type Status =
  | { phase: "idle" }
  | { phase: "reading"; file: string }
  | { phase: "importing"; done: number; total: number; imported: number }
  | { phase: "done"; imported: number; skipped: number; leftOut: string[] }
  | { phase: "error"; message: string };

function count(value: number, word: string, many = `${word}s`) {
  return `${value.toLocaleString("en")} ${value === 1 ? word : many}`;
}

function listOf(parts: string[]) {
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

async function readSpotify(files: File[], reading: (name: string) => void): Promise<Read> {
  const listens: FileListen[] = [];
  const ignored = { podcasts: 0, short: 0, private: 0 };
  for (const file of files) {
    reading(file.name);
    let history: ReturnType<typeof readSpotifyHistory>;
    try {
      history = readSpotifyHistory(JSON.parse(await file.text()));
    } catch {
      throw new Error(`${file.name} isn't a Spotify streaming history file.`);
    }
    listens.push(...history.listens);
    ignored.podcasts += history.podcasts;
    ignored.short += history.short;
    ignored.private += history.private;
  }
  return {
    listens,
    leftOut: [
      `${count(ignored.short, "play")} under 30 seconds`,
      count(ignored.podcasts, "podcast or audiobook episode"),
      ...(ignored.private > 0 ? [`${count(ignored.private, "play")} from private sessions`] : []),
    ],
  };
}

async function readApple(files: File[], reading: (name: string) => void): Promise<Read> {
  const contents = [];
  for (const file of files) {
    reading(file.name);
    contents.push({ name: file.name, text: await file.text() });
  }
  const history = readAppleMusicFiles(contents);
  return {
    listens: history.listens,
    leftOut: [
      `${count(history.short, "play")} under 30 seconds`,
      ...(history.videos > 0 ? [count(history.videos, "video")] : []),
      ...(history.noArtist > 0 ? [`${count(history.noArtist, "play")} whose artist wasn't in the export`] : []),
    ],
  };
}

const SOURCES = {
  spotify: {
    label: "Streaming history files",
    accept: ".json,application/json",
    button: "Import from Spotify",
    read: readSpotify,
  },
  apple: { label: "Apple Music files", accept: ".csv,text/csv", button: "Import from Apple Music", read: readApple },
};

export default function FileImportForm({ source }: { source: Source }) {
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const busy = status.phase === "reading" || status.phase === "importing";
  const { label, accept, button, read } = SOURCES[source];

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = [...((event.currentTarget.elements.namedItem("files") as HTMLInputElement).files ?? [])];
    if (files.length === 0) return;

    let result: Read;
    try {
      result = await read(files, (file) => setStatus({ phase: "reading", file }));
    } catch (error) {
      setStatus({ phase: "error", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const listens = result.listens.sort((a, b) => a.playedAt - b.playedAt);

    let imported = 0;
    let skipped = 0;
    for (let start = 0; start < listens.length; start += FILE_BATCH) {
      setStatus({ phase: "importing", done: start, total: listens.length, imported });
      const batch = await importFileBatch(listens.slice(start, start + FILE_BATCH));
      if (batch.error) {
        setStatus({ phase: "error", message: `${batch.error} ${count(imported, "play")} were imported before that.` });
        return;
      }
      imported += batch.imported;
      skipped += batch.skipped;
    }
    await finishFileImport();
    setStatus({ phase: "done", imported, skipped, leftOut: result.leftOut });
  }

  return (
    <form onSubmit={upload} className="stack">
      <label>
        {label}
        <input name="files" type="file" accept={accept} multiple required disabled={busy} />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Importing…" : button}
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
            <p className="muted">Left out: {listOf(status.leftOut)}.</p>
          </>
        )}
        {status.phase === "error" && <p className="error">{status.message}</p>}
      </div>
    </form>
  );
}
