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
    const refreshSoon = () => {
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

    const fallback = setInterval(() => router.refresh(), FALLBACK_SECONDS * 1000);

    return () => {
      source.close();
      clearInterval(fallback);
      clearTimeout(pending);
    };
  }, [router, key]);

  return null;
}
