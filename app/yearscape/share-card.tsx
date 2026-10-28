"use client";

import { useState } from "react";

export default function ShareCard({ year }: { year: number }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function share() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/yearscape/card?year=${year}`);
      if (!response.ok) throw new Error(`card ${response.status}`);
      const file = new File([await response.blob()], `soundscape-${year}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `My ${year} Yearscape` }).catch(() => {});
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <p className="share-card">
      <button type="button" onClick={share} disabled={busy}>
        {busy ? "Making image…" : "Share image"}
      </button>
      {failed && <span className="error"> Couldn&apos;t make the image. Try again.</span>}
    </p>
  );
}
