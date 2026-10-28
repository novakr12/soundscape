"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const FALLBACK_SECONDS = 30;

export default function ProfileUpdates({ username }: { username: string }) {
  const router = useRouter();

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = undefined;
        router.refresh();
      }, 300);
    };

    const source = new EventSource(`/api/live/${encodeURIComponent(username)}`);
    source.addEventListener("play", refreshSoon);
    source.addEventListener("listening", refreshSoon);

    const fallback = setInterval(() => router.refresh(), FALLBACK_SECONDS * 1000);

    return () => {
      source.close();
      clearInterval(fallback);
      clearTimeout(pending);
    };
  }, [router, username]);

  return null;
}
