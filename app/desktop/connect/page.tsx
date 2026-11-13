import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import ConnectButton from "./connect-button";
import { deviceName } from "./device";

export const metadata: Metadata = { title: "Connect the desktop app · Soundscape" };

export default async function DesktopConnectPage({ searchParams }: { searchParams: Promise<{ device?: string }> }) {
  const device = deviceName((await searchParams).device);
  const userId = await currentUserId();
  if (!userId) {
    const back = `/desktop/connect?${new URLSearchParams({ device })}`;
    redirect(`/login?${new URLSearchParams({ next: back })}`);
  }

  return (
    <>
      <h1>Connect the desktop app</h1>
      <p>
        <strong>{device}</strong> wants to send what you play to Soundscape as <strong>{userId}</strong> and show your
        notifications.
      </p>
      <p className="muted">
        It gets its own token, which you can see and revoke on the <Link href="/connect">Connect page</Link>.
      </p>
      <ConnectButton device={device} />
    </>
  );
}
