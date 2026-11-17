import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import ConnectButton from "./connect-button";
import { deviceName } from "./device";

export const metadata: Metadata = { title: "Connect the desktop app · Soundscape" };

export default async function DesktopConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string; app?: string }>;
}) {
  const asked = await searchParams;
  const android = asked.app === "android";
  const device = deviceName(asked.device, android ? "Android app" : "Desktop app");
  const userId = await currentUserId();
  if (!userId) {
    const back = `/desktop/connect?${new URLSearchParams(android ? { device, app: "android" } : { device })}`;
    redirect(`/login?${new URLSearchParams({ next: back })}`);
  }

  return (
    <>
      <h1>{android ? "Connect the Android app" : "Connect the desktop app"}</h1>
      <p>
        {android ? (
          <>
            <strong>{device}</strong> wants to keep playing your music when the app is in the background, and count
            those plays as <strong>{userId}</strong>.
          </>
        ) : (
          <>
            <strong>{device}</strong> wants to send what you play to Soundscape as <strong>{userId}</strong> and show
            your notifications.
          </>
        )}
      </p>
      <p className="muted">
        It gets its own token, which you can see and revoke on the <Link href="/connect">Connect page</Link>.
      </p>
      <ConnectButton device={device} />
    </>
  );
}
