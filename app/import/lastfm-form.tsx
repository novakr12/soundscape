"use client";

import { useActionState, useEffect, useState } from "react";
import type { LastfmProgress } from "@/lib/lastfm";
import { type LastfmFormState, lastfmProgress, runLastfm } from "./actions";

const POLL_MS = 2000;

function count(value: number, word: string) {
  return `${value.toLocaleString("en")} ${word}${value === 1 ? "" : "s"}`;
}

function Status({ progress }: { progress: LastfmProgress }) {
  const share = progress.pages > 0 ? (progress.pagesDone / progress.pages) * 100 : 100;
  const skipped = progress.skipped > 0 ? `, skipped ${count(progress.skipped, "scrobble")} you already had` : "";
  if (progress.done) {
    return (
      <>
        <p>
          {progress.total === 0
            ? "No new scrobbles since the last import."
            : `Imported ${count(progress.imported, "scrobble")} from ${progress.lastfmUser}${skipped}.`}
        </p>
        {progress.error && <p className="error">{progress.error}</p>}
      </>
    );
  }
  return (
    <>
      <p>
        Importing {progress.lastfmUser}&apos;s {count(progress.total, "scrobble")}:{" "}
        {progress.imported.toLocaleString("en")} imported so far{skipped}.
      </p>
      <span className="progress-bar" aria-hidden="true">
        <span style={{ width: `${share}%` }} />
      </span>
      <p className="muted">You can leave this page. The import keeps going in the background.</p>
    </>
  );
}

export default function LastfmForm({ defaultUser, initial }: { defaultUser?: string; initial: LastfmProgress | null }) {
  const [state, action, pending] = useActionState<LastfmFormState, FormData>(runLastfm, {});
  const [progress, setProgress] = useState(initial);

  useEffect(() => {
    if (state.progress) setProgress(state.progress);
  }, [state.progress]);

  useEffect(() => {
    if (!progress || progress.done) return;
    const timer = setTimeout(async () => setProgress(await lastfmProgress()), POLL_MS);
    return () => clearTimeout(timer);
  }, [progress]);

  const running = progress !== null && !progress.done;

  return (
    <form action={action} className="stack">
      <label>
        Last.fm username
        <input name="lastfmUser" defaultValue={state.lastfmUser ?? defaultUser} required />
      </label>
      <button type="submit" disabled={pending || running}>
        {pending ? "Starting…" : running ? "Importing…" : "Import scrobbles"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
      {progress && (
        <div className="cover-status" aria-live="polite">
          <Status progress={progress} />
        </div>
      )}
    </form>
  );
}
