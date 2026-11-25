"use client";

import { useEffect, useRef, useState } from "react";
import { HeartIcon } from "./player-icons";

const MAX_CACHE = 200;
const LOVE_EVENT = "soundscape-love-changed";
const lovedCache = new Map<string, boolean>();

function loveKey(artist: string, title: string) {
  return `${artist.trim().toLowerCase()}\0${title.trim().toLowerCase()}`;
}

function rememberLoved(key: string, loved: boolean) {
  if (lovedCache.has(key)) lovedCache.delete(key);
  else if (lovedCache.size >= MAX_CACHE) {
    const oldest = lovedCache.keys().next().value;
    if (oldest !== undefined) lovedCache.delete(oldest);
  }
  lovedCache.set(key, loved);
}

function notifyLove(key: string, loved: boolean) {
  window.dispatchEvent(new CustomEvent(LOVE_EVENT, { detail: { key, loved } }));
}

export default function PlayerLove({
  artist,
  title,
  enabled,
  active = true,
}: {
  artist: string;
  title: string;
  enabled: boolean;
  active?: boolean;
}) {
  const cleanArtist = artist.trim();
  const cleanTitle = title.trim();
  const key = cleanArtist && cleanTitle ? loveKey(cleanArtist, cleanTitle) : "";
  const [loved, setLoved] = useState(() => (key ? (lovedCache.get(key) ?? false) : false));
  const [pending, setPending] = useState(false);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!enabled || !active || !key) return;
    setLoved(lovedCache.get(key) ?? false);
    setPending(false);
    const stop = new AbortController();
    fetch(`/api/love?${new URLSearchParams({ artist: cleanArtist, title: cleanTitle })}`, { signal: stop.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ loved?: unknown }>) : null))
      .then((data) => {
        if (stop.signal.aborted || typeof data?.loved !== "boolean") return;
        rememberLoved(key, data.loved);
        if (keyRef.current === key) setLoved(data.loved);
      })
      .catch(() => {});
    return () => stop.abort();
  }, [enabled, active, cleanArtist, cleanTitle, key]);

  useEffect(() => {
    if (!key) return;
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: unknown; loved?: unknown }>).detail;
      if (detail?.key === key && typeof detail.loved === "boolean") setLoved(detail.loved);
    };
    window.addEventListener(LOVE_EVENT, sync);
    return () => window.removeEventListener(LOVE_EVENT, sync);
  }, [key]);

  if (!enabled || !key) return null;

  async function toggle() {
    if (!key || pending) return;
    const next = !loved;
    const activeKey = key;
    setLoved(next);
    rememberLoved(activeKey, next);
    notifyLove(activeKey, next);
    setPending(true);
    try {
      const response = await fetch("/api/love", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artist: cleanArtist, title: cleanTitle, loved: next }),
      });
      if (!response.ok) {
        rememberLoved(activeKey, !next);
        notifyLove(activeKey, !next);
        if (keyRef.current === activeKey) setLoved(!next);
      }
    } catch {
      rememberLoved(activeKey, !next);
      notifyLove(activeKey, !next);
      if (keyRef.current === activeKey) setLoved(!next);
    } finally {
      if (keyRef.current === activeKey) setPending(false);
    }
  }

  return (
    <button
      type="button"
      className={loved ? "icon-button player-love loved" : "icon-button player-love"}
      data-player="love"
      aria-label={loved ? `Unlove ${cleanTitle}` : `Love ${cleanTitle}`}
      aria-pressed={loved}
      title={loved ? "Remove from loved songs" : "Love this song"}
      disabled={pending}
      onClick={toggle}
    >
      <HeartIcon size={18} filled={loved} />
    </button>
  );
}
