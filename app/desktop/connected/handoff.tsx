"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const APP_SCHEME = "soundscape-desktop";

export default function Handoff() {
  const [state, setState] = useState<"checking" | "sent" | "missing">("checking");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, "", window.location.pathname);
    if (!params.get("token") || !params.get("user")) return setState("missing");
    setState("sent");
    window.location.href = `${APP_SCHEME}://connected?${params}`;
  }, []);

  if (state === "missing") {
    return (
      <p className="muted">
        Nothing to hand over here. Open the desktop app and connect from its menu, or see your devices on the{" "}
        <Link href="/connect">Connect page</Link>.
      </p>
    );
  }
  return (
    <p className="muted">
      {state === "sent"
        ? "The desktop app should pick this up now. If this page stays open, you opened it in a browser instead of the app; you can revoke the new token on the Connect page."
        : "Finishing…"}
    </p>
  );
}
