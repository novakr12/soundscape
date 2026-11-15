"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type DesktopWindow = Window & {
  soundscapeDesktop?: unknown;
  navigation?: EventTarget & { canGoBack?: boolean; canGoForward?: boolean };
};

function Arrow({ back }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d={back ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function House() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 11l8-7 8 7M6 9.5V20h4.5v-5h3v5H18V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AppNav() {
  const pathname = usePathname();
  const [inApp, setInApp] = useState(false);
  const [can, setCan] = useState({ back: true, forward: true });

  useEffect(() => {
    const view = window as DesktopWindow;
    if (!view.soundscapeDesktop) return;
    setInApp(true);
    const navigation = view.navigation;
    if (!navigation || typeof navigation.canGoBack !== "boolean") return;
    const read = () => setCan({ back: Boolean(navigation.canGoBack), forward: Boolean(navigation.canGoForward) });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const follow = () => {
      clearTimeout(timer);
      timer = setTimeout(read, 0);
    };
    read();
    navigation.addEventListener("currententrychange", follow);
    return () => {
      clearTimeout(timer);
      navigation.removeEventListener("currententrychange", follow);
    };
  }, []);

  useEffect(() => {
    const view = window as DesktopWindow;
    const navigation = view.navigation;
    if (view.soundscapeDesktop && pathname && navigation && typeof navigation.canGoBack === "boolean") {
      setCan({ back: Boolean(navigation.canGoBack), forward: Boolean(navigation.canGoForward) });
    }
  }, [pathname]);

  if (!inApp) return null;
  return (
    <div className="app-nav" role="group" aria-label="Go">
      <button
        type="button"
        className="icon-button"
        aria-label="Back"
        title="Back (Alt+←)"
        disabled={!can.back}
        onClick={() => window.history.back()}
      >
        <Arrow back />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Forward"
        title="Forward (Alt+→)"
        disabled={!can.forward}
        onClick={() => window.history.forward()}
      >
        <Arrow />
      </button>
      <Link
        className="icon-button"
        href="/"
        aria-label="Home"
        title="Home (Alt+Home)"
        aria-current={pathname === "/" ? "page" : undefined}
      >
        <House />
      </Link>
    </div>
  );
}
