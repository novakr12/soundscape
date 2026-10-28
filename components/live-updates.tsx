"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArtistLink, SongLink } from "./music-links";

type LivePlay = {
  userId: string | null;
  trackId: string;
  title: string;
  artist: string;
  receivedAt: number;
};

type Status = "connecting" | "live" | "reconnecting";

export default function LiveUpdates({ fallbackSeconds = 30 }: { fallbackSeconds?: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("connecting");
  const [latest, setLatest] = useState<LivePlay | null>(null);

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = undefined;
        router.refresh();
      }, 300);
    };

    const source = new EventSource("/api/live");
    source.onopen = () => setStatus("live");
    source.onerror = () => setStatus("reconnecting");
    source.onmessage = (event) => {
      setLatest({ ...JSON.parse(event.data), receivedAt: Date.now() });
      refreshSoon();
    };
    source.addEventListener("listening", refreshSoon);

    const fallback = setInterval(() => router.refresh(), fallbackSeconds * 1000);

    return () => {
      source.close();
      clearInterval(fallback);
      clearTimeout(pending);
    };
  }, [router, fallbackSeconds]);

  return (
    <p className="muted live">
      <span className={status === "live" ? "dot on" : "dot"} />{" "}
      {status === "live" ? "Live" : status === "connecting" ? "Connecting…" : "Reconnecting…"}
      {latest && (
        <span key={latest.receivedAt} className="live-latest">
          {" "}
          · {latest.userId ?? "Someone"} just played{" "}
          <strong>
            <SongLink trackId={latest.trackId}>{latest.title}</SongLink>
          </strong>{" "}
          · <ArtistLink name={latest.artist} />
        </span>
      )}
    </p>
  );
}
