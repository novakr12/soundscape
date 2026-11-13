"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "./actions";

type State = "checking" | "unsupported" | "insecure" | "blocked" | "off" | "on" | "busy";

function keyBytes(base64: string) {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export default function PushSettings({ publicKey, devices }: { publicKey: string; devices: number }) {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (!window.isSecureContext) return setState("insecure");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return setState("unsupported");
    }
    if (Notification.permission === "denied") return setState("blocked");
    currentSubscription()
      .then((subscription) => setState(subscription ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  async function turnOn() {
    setState("busy");
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      const result = await savePushSubscription(subscription.toJSON());
      if (result.error) {
        await subscription.unsubscribe();
        setMessage({ text: result.error, error: true });
        return setState("off");
      }
      setState("on");
    } catch {
      setMessage({ text: "This browser couldn't turn on notifications. Try again in a moment.", error: true });
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    setMessage(null);
    const subscription = await currentSubscription().catch(() => null);
    if (subscription) {
      await removePushSubscription(subscription.endpoint);
      await subscription.unsubscribe().catch(() => false);
    }
    setState("off");
  }

  async function test() {
    setMessage(null);
    const result = await sendTestPush();
    setMessage(
      result.error ? { text: result.error, error: true } : { text: "Sent. It should appear in a few seconds." },
    );
  }

  return (
    <div className="stack">
      {state === "checking" && <p className="muted">Checking this device…</p>}
      {state === "insecure" && (
        <p className="muted">
          Notifications need a secure address. Open Soundscape through its https address, for example the one Tailscale
          Serve gives you, and turn them on there.
        </p>
      )}
      {state === "unsupported" && (
        <p className="muted">
          This browser can&apos;t receive notifications. On iPhone and iPad, add Soundscape to the Home Screen first and
          open it from there.
        </p>
      )}
      {state === "blocked" && (
        <p className="muted">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings.
        </p>
      )}
      {(state === "off" || state === "on" || state === "busy") && (
        <p>
          Notifications are <strong>{state === "on" ? "on" : "off"}</strong> on this device.
        </p>
      )}
      {(state === "off" || state === "busy") && (
        <button type="button" onClick={turnOn} disabled={state === "busy"}>
          Turn on notifications
        </button>
      )}
      {state === "on" && (
        <div className="toolbar">
          <button type="button" onClick={test}>
            Send a test notification
          </button>
          <button type="button" onClick={turnOff}>
            Turn off
          </button>
        </div>
      )}
      {message && <p className={message.error ? "error" : "muted"}>{message.text}</p>}
      {devices > 0 && (
        <p className="muted">
          On for {devices} {devices === 1 ? "device" : "devices"} in total.
        </p>
      )}
    </div>
  );
}
