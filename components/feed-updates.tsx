"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const FALLBACK_SECONDS = 60;

export default function FeedUpdates({ users }: { users: string[] }) {
  const router = useRouter();
  const key = users.join(",");

  useEffect(() => {
    const following = new Set(key.split(","));
    let pending: ReturnType<typeof setTimeout> | undefined;
    let missed = false;
    const refreshSoon = () => {
      if (document.hidden) {
        missed = true;
        return;
      }
      missed = false;
      if (pending) return;
      pending = setTimeout(() => {
        pending = undefined;
        router.refresh();
      }, 300);
    };

    const source = new EventSource("/api/live");
    source.onmessage = (event) => {
      const { userId } = JSON.parse(event.data);
      if (userId && following.has(userId)) refreshSoon();
    };
    source.addEventListener("listening", refreshSoon);

    const onVisibility = () => {
      if (!document.hidden && (missed || source.readyState !== EventSource.OPEN)) {
        refreshSoon();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const fallback = setInterval(() => {
      if (!document.hidden && source.readyState !== EventSource.OPEN) router.refresh();
    }, FALLBACK_SECONDS * 1000);

    return () => {
      source.close();
      clearInterval(fallback);
      clearTimeout(pending);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, key]);

  return null;
}
