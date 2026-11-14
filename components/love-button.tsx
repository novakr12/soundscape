"use client";

import { useState, useTransition } from "react";
import { loveAction } from "@/app/track/actions";

export default function LoveButton({ trackId, loved }: { trackId: string; loved: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => setError(await loveAction(trackId, !loved)));
  }

  return (
    <>
      <button
        type="button"
        className={loved ? "follow-button following" : "follow-button"}
        aria-pressed={loved}
        disabled={pending}
        onClick={toggle}
      >
        {loved ? "♥ Loved" : "♡ Love"}
      </button>
      {error && <small className="error">{error}</small>}
    </>
  );
}
