"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type HistoryState = { back?: boolean; forward?: boolean };

type DesktopWindow = Window & {
  soundscapeDesktop?: unknown;
  soundscapeDesktopHistory?: HistoryState;
  navigation?: EventTarget & { canGoBack?: boolean; canGoForward?: boolean };
};

function validHistory(state: HistoryState | undefined): state is { back: boolean; forward: boolean } {
  return Boolean(state && typeof state.back === "boolean" && typeof state.forward === "boolean");
}

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
    if (view.soundscapeDesktop) {
      setInApp(true);
      return;
    }
    const ready = () => setInApp(Boolean(view.soundscapeDesktop));
    view.addEventListener("soundscape-desktop-ready", ready);
    return () => view.removeEventListener("soundscape-desktop-ready", ready);
  }, []);

  useEffect(() => {
    if (!inApp) return;
    const view = window as DesktopWindow;
    const navigation = view.navigation;
    if (navigation && typeof navigation.canGoBack === "boolean") {
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
    }
    const readDesktop = (detail?: HistoryState) => {
      const state = detail ?? view.soundscapeDesktopHistory;
      if (validHistory(state)) setCan(state);
    };
    readDesktop();
    const onHistory = (event: Event) => readDesktop((event as CustomEvent<HistoryState | undefined>).detail);
    view.addEventListener("soundscape-desktop-history", onHistory);
    return () => view.removeEventListener("soundscape-desktop-history", onHistory);
  }, [inApp]);

  useEffect(() => {
    const view = window as DesktopWindow;
    const navigation = view.navigation;
    if (!view.soundscapeDesktop || !pathname) return;
    if (navigation && typeof navigation.canGoBack === "boolean") {
      setCan({ back: Boolean(navigation.canGoBack), forward: Boolean(navigation.canGoForward) });
    } else if (validHistory(view.soundscapeDesktopHistory)) {
      setCan(view.soundscapeDesktopHistory);
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
