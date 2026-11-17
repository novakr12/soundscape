"use client";

import { useEffect } from "react";
import { COVER_RETRY_DELAY_MS, retryAddress } from "@/lib/cover-retry";

export default function CoverRetry() {
  useEffect(() => {
    const failed = (event: Event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) return;
      const next = retryAddress(image.getAttribute("src") ?? "", window.location.origin, Date.now());
      if (!next) return;
      window.setTimeout(() => {
        if (image.isConnected) image.src = next;
      }, COVER_RETRY_DELAY_MS);
    };
    document.addEventListener("error", failed, true);
    return () => document.removeEventListener("error", failed, true);
  }, []);
  return null;
}
