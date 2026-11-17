"use client";

import { useEffect, useState } from "react";

const VERSION = /^\d+\.\d+\.\d+$/;

export function desktopVersion(value: unknown) {
  return typeof value === "string" && VERSION.test(value) ? value : null;
}

export function atLeast(version: string | null, wanted: string) {
  if (!version) return false;
  const have = version.split(".").map(Number);
  const need = wanted.split(".").map(Number);
  for (let i = 0; i < need.length; i++) {
    if ((have[i] ?? 0) !== need[i]) return (have[i] ?? 0) > need[i];
  }
  return true;
}

export function useDesktopVersion() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    setVersion(desktopVersion((window as Window & { soundscapeDesktopVersion?: unknown }).soundscapeDesktopVersion));
  }, []);
  return version;
}

export default function AppVersion() {
  const version = useDesktopVersion();
  if (!version) return null;
  return (
    <span className="app-version" title={`Soundscape Desktop ${version}`}>
      v{version}
    </span>
  );
}
