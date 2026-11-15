"use client";

import { useState } from "react";
import type { RadioSeed } from "@/lib/radio";
import { usePlayer } from "./player";

export default function RadioButton({ seed, label }: { seed: RadioSeed; label: string }) {
  const { startRadio } = usePlayer();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setProblem(null);
    setProblem(await startRadio(seed));
    setBusy(false);
  }

  return (
    <>
      <button type="button" onClick={start} disabled={busy} title={label} aria-busy={busy}>
        {busy ? "Starting radio…" : "📻 Start radio"}
      </button>
      {problem && (
        <p className="muted" role="status">
          {problem}
        </p>
      )}
    </>
  );
}
