"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { type FinderResults, finderPages, findPages, NO_RESULTS } from "@/lib/finder";
import { MIN_QUERY_LENGTH } from "@/lib/search-limits";
import Cover from "./cover";
import { type PlayerTrack, usePlayer } from "./player";

export const OPEN_FINDER = "soundscape-open-finder";
const WAIT_MS = 120;
const PAGES_WITHOUT_QUERY = 8;

type Item = {
  key: string;
  kind: string;
  title: string;
  detail?: string;
  cover?: string;
  round?: boolean;
  icon?: "page" | "search";
  href?: string;
  track?: PlayerTrack;
};

function typing(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null
  );
}

export default function Finder({ username, admin }: { username: string | null; admin: boolean }) {
  const router = useRouter();
  const { play } = usePlayer();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FinderResults>(NO_RESULTS);
  const [answered, setAnswered] = useState("");
  const [active, setActive] = useState(0);
  const pages = useMemo(() => finderPages(username, admin), [username, admin]);

  useEffect(() => {
    const show = (text: string) => {
      setQuery(text);
      setActive(0);
      setOpen(true);
    };
    const pressed = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else show("");
      } else if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !typing(event.target)) {
        event.preventDefault();
        show("");
      }
    };
    const asked = (event: Event) => show(String((event as CustomEvent<unknown>).detail ?? ""));
    window.addEventListener("keydown", pressed);
    window.addEventListener(OPEN_FINDER, asked);
    return () => {
      window.removeEventListener("keydown", pressed);
      window.removeEventListener(OPEN_FINDER, asked);
    };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      input.current?.focus();
      input.current?.select();
    }
    if (!open && element.open) element.close();
  }, [open]);

  const wanted = query.trim();
  useEffect(() => {
    if (!open) return;
    if (wanted.length < MIN_QUERY_LENGTH) {
      setResults(NO_RESULTS);
      setAnswered(wanted);
      return;
    }
    const stop = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/finder?${new URLSearchParams({ q: wanted })}`, { signal: stop.signal })
        .then((response) => (response.ok ? response.json() : NO_RESULTS))
        .then((found: FinderResults) => {
          setResults(found);
          setAnswered(wanted);
          setActive(0);
        })
        .catch(() => {});
    }, WAIT_MS);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  }, [wanted, open]);

  const items = useMemo(() => {
    const matchingPages = wanted ? findPages(wanted, pages) : pages.slice(0, PAGES_WITHOUT_QUERY);
    const pageItems: Item[] = matchingPages.map((page) => ({
      key: `page:${page.href}`,
      kind: "Page",
      title: page.label,
      icon: "page",
      href: page.href,
    }));
    const fresh = answered === wanted ? results : NO_RESULTS;
    const music: Item[] = [
      ...fresh.songs.map((song) => ({
        key: `song:${song.trackId}`,
        kind: "Song",
        title: song.title,
        detail: song.artist,
        cover: song.cover,
        href: `/track/${encodeURIComponent(song.trackId)}`,
        track: { trackId: song.trackId, title: song.title, artist: song.artist, cover: song.cover },
      })),
      ...fresh.artists.map((artist) => ({
        key: `artist:${artist.artistId}`,
        kind: "Artist",
        title: artist.name,
        cover: artist.cover,
        round: artist.photo,
        href: `/artist/${encodeURIComponent(artist.artistId)}`,
      })),
      ...fresh.albums.map((album) => ({
        key: `album:${album.albumId}`,
        kind: "Album",
        title: album.title,
        detail: album.artist,
        cover: album.cover,
        href: `/album/${encodeURIComponent(album.albumId)}`,
      })),
      ...fresh.library.map((song) => ({
        key: `library:${song.songId ?? song.trackId}`,
        kind: "In your Navidrome",
        title: song.title,
        detail: [song.artist, song.album].filter(Boolean).join(" · "),
        cover: song.cover,
        href: song.newSong ? song.albumHref : `/track/${encodeURIComponent(song.trackId)}`,
        track: song,
      })),
    ];
    const pagesFirst =
      wanted.length > 0 && matchingPages.some((page) => page.label.toLowerCase().startsWith(wanted.toLowerCase()));
    const everything: Item[] = pagesFirst ? [...pageItems, ...music] : [...music, ...pageItems];
    if (wanted.length >= MIN_QUERY_LENGTH) {
      everything.push({
        key: "search",
        kind: "Search",
        title: `Search for “${wanted}”`,
        icon: "search",
        href: `/search?${new URLSearchParams({ q: wanted })}`,
      });
    }
    return everything;
  }, [wanted, pages, results, answered]);

  const chosen = Math.min(active, Math.max(items.length - 1, 0));

  function close() {
    setOpen(false);
  }

  function choose(item: Item | undefined, playIt: boolean) {
    if (!item) return;
    if (playIt && item.track) {
      play(item.track);
      close();
      return;
    }
    if (item.href) {
      router.push(item.href);
      close();
    } else if (item.track) {
      play(item.track);
      close();
    }
  }

  function keys(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((chosen + step + items.length) % items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(items[chosen], event.shiftKey);
    }
  }

  useEffect(() => {
    document.getElementById(`finder-${chosen}`)?.scrollIntoView({ block: "nearest" });
  }, [chosen]);

  return (
    <dialog
      ref={dialog}
      className="finder"
      aria-label="Find"
      onClose={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <input
        ref={input}
        type="search"
        className="finder-input"
        value={query}
        placeholder="Find songs, artists, albums or pages"
        aria-label="Find songs, artists, albums or pages"
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls="finder-results"
        aria-activedescendant={items.length > 0 ? `finder-${chosen}` : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={keys}
      />
      <div id="finder-results" className="finder-results" role="listbox" aria-label="Results">
        {items.map((item, at) => (
          <div
            key={item.key}
            id={`finder-${at}`}
            role="option"
            tabIndex={-1}
            aria-selected={at === chosen}
            className={at === chosen ? "active" : undefined}
            onMouseMove={() => at !== chosen && setActive(at)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => choose(item, event.shiftKey)}
          >
            {item.icon ? (
              <span className="finder-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  {item.icon === "search" ? (
                    <path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5" strokeLinecap="round" />
                  ) : (
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </svg>
              </span>
            ) : (
              <Cover src={item.cover} round={item.round} />
            )}
            <span className="finder-text">
              <span>{item.title}</span>
              {item.detail && <span className="muted">{item.detail}</span>}
            </span>
            <span className="finder-kind muted">{item.kind}</span>
            {item.track && (
              <button
                type="button"
                className="icon-button finder-play"
                aria-label={`Play ${item.title}`}
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                  choose(item, true);
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            )}
          </div>
        ))}
        {wanted.length >= MIN_QUERY_LENGTH && answered === wanted && items.length <= 1 && (
          <p className="finder-empty muted">Nothing found yet. Press Enter to search everywhere.</p>
        )}
      </div>
      <p className="finder-help muted">
        <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Shift</kbd>+<kbd>Enter</kbd> play · <kbd>Esc</kbd>{" "}
        close
      </p>
    </dialog>
  );
}
