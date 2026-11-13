import type { Metadata } from "next";
import Handoff from "./handoff";

export const metadata: Metadata = { title: "Desktop app connected · Soundscape" };

export default function DesktopConnectedPage() {
  return (
    <>
      <h1>Desktop app connected</h1>
      <Handoff />
    </>
  );
}
