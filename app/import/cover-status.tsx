"use client";

import { useEffect, useState } from "react";
import type { CoverProgress } from "@/lib/covers";
import { coverProgress } from "./actions";

const POLL_MS = 2000;

function songs(count: number) {
  return `${count.toLocaleString("en")} ${count === 1 ? "song" : "songs"}`;
}

export default function CoverStatus({ initial }: { initial: CoverProgress }) {
  const [progress, setProgress] = useState(initial);

  useEffect(() => setProgress(initial), [initial]);

  useEffect(() => {
    if (progress.done) return;
    const timer = setTimeout(async () => {
      const latest = await coverProgress();
      if (latest) setProgress(latest);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [progress]);

  const share = progress.total > 0 ? (progress.checked / progress.total) * 100 : 100;

  return (
    <section className="cover-status" aria-live="polite">
      {progress.done ? (
        <p>
          Album covers: found {progress.found.toLocaleString("en")} for {songs(progress.total)}.
        </p>
      ) : (
        <>
          <p>
            {progress.checked < progress.total
              ? `Finding album covers: ${progress.checked.toLocaleString("en")} of ${songs(progress.total)} checked, `
              : "Checking the Cover Art Archive and Navidrome for songs Deezer couldn't find, "}
            {progress.found.toLocaleString("en")} found so far.
          </p>
          <span className="progress-bar" aria-hidden="true">
            <span style={{ width: `${share}%` }} />
          </span>
          <p className="muted">You can leave this page. Covers keep arriving in the background.</p>
        </>
      )}
    </section>
  );
}
