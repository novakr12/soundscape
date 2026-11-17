"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OPEN_FINDER } from "./finder";

export default function HeaderMenu() {
  const pathname = usePathname();
  const holder = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const header = holder.current?.closest("header");
    if (!header) return;
    header.toggleAttribute("data-open", open);
  }, [open]);

  useEffect(() => {
    if (pathname) setOpen(false);
  }, [pathname]);

  return (
    <div className="header-buttons" ref={holder}>
      <button
        type="button"
        className="icon-button"
        aria-label="Search"
        onClick={() => {
          setOpen(false);
          window.dispatchEvent(new CustomEvent(OPEN_FINDER, { detail: "" }));
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={open ? "Close the menu" : "Menu"}
        aria-expanded={open}
        onClick={() => setOpen((now) => !now)}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          )}
        </svg>
      </button>
    </div>
  );
}
