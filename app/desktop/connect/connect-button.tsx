"use client";

import { useState } from "react";
import { connectDesktop } from "./actions";

export const APP_SCHEME = "soundscape-desktop";

export default function ConnectButton({ device }: { device: string }) {
  const [state, setState] = useState<{ busy?: boolean; error?: string; sent?: boolean }>({});

  async function connect() {
    setState({ busy: true });
    const result = await connectDesktop(device);
    if (!result.token || !result.user) return setState({ error: result.error ?? "Something went wrong." });
    const params = new URLSearchParams({ token: result.token, user: result.user });
    window.location.href = `${APP_SCHEME}://connected?${params}`;
    setState({ sent: true });
  }

  return (
    <div className="stack">
      <button type="button" onClick={connect} disabled={state.busy || state.sent}>
        {state.busy ? "Connecting…" : "Connect"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
      {state.sent && (
        <p className="muted">
          Connected. If this page stays open, you opened it in a browser instead of the desktop app; you can revoke the
          new token on the Connect page.
        </p>
      )}
    </div>
  );
}
