"use client";

import Link from "next/link";
import { type CSSProperties, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { extractAmbientColor } from "@/lib/ambient-color";
import { nativePort } from "@/lib/app-bridge";
import { albumIdFor, artistIdFor } from "@/lib/catalog";
import { sizedCover } from "@/lib/cover-size";
import CoverPicture from "./cover-picture";
import { SongLink } from "./music-links";
import type { PlayerTrack } from "./player";
import { CloseIcon, FullscreenIcon, LyricsIcon } from "./player-icons";
import PlayerLove from "./player-love";
import { useLyrics } from "./use-lyrics";

const SAMPLE_SIZE = 24;
const MAX_CACHED_TINTS = 100;
const tintCache = new Map<string, string | null>();

function rememberTint(url: string, color: string | null) {
  if (tintCache.size >= MAX_CACHED_TINTS) {
    const oldest = tintCache.keys().next().value;
    if (oldest !== undefined) tintCache.delete(oldest);
  }
  tintCache.set(url, color);
}

function sampleImageData(source: CanvasImageSource): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true }) ?? canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const data = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    return extractAmbientColor(data);
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function sampleCoverColor(src: string, signal: AbortSignal): Promise<string | null> {
  const url = sizedCover(src, 48) ?? src;
  if (tintCache.has(url)) return tintCache.get(url) ?? null;

  let color: string | null = null;
  const inCanvasShell = (window as Window & { soundscapeCanvasCovers?: boolean }).soundscapeCanvasCovers === true;
  try {
    let decoded = false;
    if (typeof createImageBitmap === "function") {
      try {
        const response = await fetch(url, { signal });
        if (response.ok && !signal.aborted) {
          const blob = await response.blob();
          if (!signal.aborted) {
            const bitmap = await createImageBitmap(blob);
            try {
              if (!signal.aborted) {
                color = sampleImageData(bitmap);
                decoded = true;
              }
            } finally {
              bitmap.close();
            }
          }
        }
      } catch {
        // Fall through below when Image fallback is safe
      }
    }
    if (!decoded && !inCanvasShell && !signal.aborted) {
      color = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const cleanup = () => {
          signal.removeEventListener("abort", onAbort);
          img.onload = null;
          img.onerror = null;
        };
        const onAbort = () => {
          cleanup();
          resolve(null);
        };
        img.onload = () => {
          cleanup();
          resolve(sampleImageData(img));
        };
        img.onerror = () => {
          cleanup();
          resolve(null);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        img.src = url;
      });
    }
  } catch {
    color = null;
  }

  if (!signal.aborted) rememberTint(url, color);
  return color;
}

type NowPlayingTheaterProps = {
  track: PlayerTrack;
  contextLabel?: string;
  playing?: boolean;
  time: () => number;
  audio?: RefObject<HTMLAudioElement | null>;
  onSeek: (seconds: number) => void;
  onClose: () => void;
  showLyrics: boolean;
  onToggleLyrics: () => void;
  canLove: boolean;
  visualizer?: ReactNode;
  seek: ReactNode;
  transport: ReactNode;
  actions?: ReactNode;
  volume?: ReactNode;
};

export default function NowPlayingTheater({
  track,
  contextLabel,
  playing,
  time,
  audio,
  onSeek,
  onClose,
  showLyrics,
  onToggleLyrics,
  canLove,
  visualizer,
  seek,
  transport,
  actions,
  volume,
}: NowPlayingTheaterProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const reducedMotionRef = useRef(false);
  const lyricsScrollRef = useRef<HTMLDivElement>(null);
  const lyricsListRef = useRef<HTMLOListElement>(null);
  const [tint, setTint] = useState<{ src: string; color: string | null }>({ src: "", color: null });
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const enteredFullscreenRef = useRef(false);

  const { loading, failed, lyrics, activeLine } = useLyrics({
    track,
    time,
    playing,
    audio,
    enabled: showLyrics,
  });

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("theater-open");
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]") !== null) return;
      event.preventDefault();
      closeCallback.current();
    };
    window.addEventListener("keydown", onKeyDown);

    const view = window as Window & { soundscapeNativeFullscreen?: boolean };
    const hasNative = view.soundscapeNativeFullscreen === true;
    const hasDom =
      typeof document.documentElement.requestFullscreen === "function" && document.fullscreenEnabled !== false;
    setCanFullscreen(hasNative || hasDom);
    setIsFullscreen(Boolean(document.fullscreenElement));

    const onDomFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    const onNativeFullscreen = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail === "boolean") setIsFullscreen(detail);
    };
    const reducedQuery =
      typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const syncReduced = () => {
      reducedMotionRef.current = Boolean(reducedQuery?.matches);
    };
    syncReduced();
    reducedQuery?.addEventListener("change", syncReduced);
    document.addEventListener("fullscreenchange", onDomFullscreen);
    window.addEventListener("soundscape-fullscreen", onNativeFullscreen);

    return () => {
      document.body.classList.remove("theater-open");
      window.removeEventListener("keydown", onKeyDown);
      reducedQuery?.removeEventListener("change", syncReduced);
      document.removeEventListener("fullscreenchange", onDomFullscreen);
      window.removeEventListener("soundscape-fullscreen", onNativeFullscreen);
      if (enteredFullscreenRef.current) {
        enteredFullscreenRef.current = false;
        const port = nativePort(window as Window & { soundscapeNative?: unknown });
        if (view.soundscapeNativeFullscreen && port) {
          try {
            port.postMessage(JSON.stringify({ do: "fullscreen", on: false }));
          } catch {}
        } else if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
          document.exitFullscreen().catch(() => {});
        }
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const cover = track.cover;
    if (!cover) {
      setTint({ src: "", color: null });
      return;
    }
    const stop = new AbortController();
    sampleCoverColor(cover, stop.signal).then((color) => {
      if (!stop.signal.aborted) setTint({ src: cover, color });
    });
    return () => {
      stop.abort();
    };
  }, [track.cover]);

  useEffect(() => {
    if (!showLyrics || activeLine < 0) return;
    const box = lyricsScrollRef.current;
    const line = lyricsListRef.current?.children[activeLine] as HTMLElement | undefined;
    if (!box || !line) return;
    box.scrollTo({
      top: line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2,
      behavior: reducedMotionRef.current ? "auto" : "smooth",
    });
  }, [showLyrics, activeLine]);

  function toggleFullscreen() {
    const view = window as Window & { soundscapeNativeFullscreen?: boolean };
    const port = nativePort(window as Window & { soundscapeNative?: unknown });
    if (view.soundscapeNativeFullscreen && port) {
      const next = !isFullscreen;
      enteredFullscreenRef.current = next;
      try {
        port.postMessage(JSON.stringify({ do: "fullscreen", on: next }));
      } catch {}
      return;
    }
    if (document.fullscreenElement) {
      enteredFullscreenRef.current = false;
      document.exitFullscreen().catch(() => {});
    } else if (typeof document.documentElement.requestFullscreen === "function") {
      enteredFullscreenRef.current = true;
      document.documentElement.requestFullscreen().catch(() => {
        enteredFullscreenRef.current = false;
      });
    }
  }

  const fallbackArtistId = artistIdFor(track.artist);
  const artistHref =
    track.artistHref ??
    (fallbackArtistId
      ? `/artist/${encodeURIComponent(fallbackArtistId)}?name=${encodeURIComponent(track.artist)}`
      : `/music?q=${encodeURIComponent(track.artist)}`);
  const fallbackAlbumId = track.album ? albumIdFor(track.artist, track.album) : null;
  const albumHref = track.album
    ? (track.albumHref ??
      (fallbackAlbumId
        ? `/album/${encodeURIComponent(fallbackAlbumId)}?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.album)}`
        : `/music?q=${encodeURIComponent(track.album)}`))
    : undefined;
  const activeTint = track.cover && tint.src === track.cover ? tint.color : null;

  const lyricsBody = useMemo(() => {
    if (loading) return <p className="muted">Looking for lyrics…</p>;
    if (failed) return <p className="muted">Lyrics couldn&apos;t be loaded right now.</p>;
    if (!lyrics) return <p className="muted">No lyrics found for this song.</p>;
    if (lyrics.instrumental) return <p className="muted">Instrumental</p>;
    return (
      <ol ref={lyricsListRef} className={lyrics.synced ? "theater-lyrics synced" : "theater-lyrics"}>
        {lyrics.lines.map((line, i) => (
          <li
            key={`${i}-${line.at ?? ""}`}
            className={i === activeLine ? "current" : i < activeLine ? "sung" : undefined}
          >
            {lyrics.synced ? (
              <button
                type="button"
                onClick={() => {
                  if (line.at !== undefined) onSeekRef.current(line.at);
                }}
              >
                {line.text || "♪"}
              </button>
            ) : (
              line.text || "\u00a0"
            )}
          </li>
        ))}
      </ol>
    );
  }, [loading, failed, lyrics, activeLine]);

  return (
    <section className="theater" role="dialog" aria-modal="true" aria-label="Now playing">
      <div
        className="theater-bg"
        aria-hidden="true"
        style={activeTint ? ({ "--theater-tint": activeTint } as CSSProperties) : undefined}
      />
      <div className="theater-head">
        <p className="theater-context muted">{contextLabel ?? "Now playing"}</p>
        <div className="theater-head-actions">
          <button
            type="button"
            className="icon-button player-toggle"
            aria-label={showLyrics ? "Hide lyrics" : "Show lyrics"}
            aria-pressed={showLyrics}
            title="Lyrics (L)"
            onClick={onToggleLyrics}
          >
            <LyricsIcon size={20} />
          </button>
          {canFullscreen && (
            <button
              type="button"
              className="icon-button player-toggle"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              aria-pressed={isFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Toggle fullscreen"}
              onClick={toggleFullscreen}
            >
              <FullscreenIcon size={20} active={isFullscreen} />
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            aria-label="Close now playing view"
            title="Close (Esc)"
            onClick={onClose}
          >
            <CloseIcon size={22} />
          </button>
        </div>
      </div>

      <div className={showLyrics ? "theater-stage with-lyrics" : "theater-stage"}>
        <div className="theater-art-col">
          <div className="theater-cover">
            {track.cover ? (
              <CoverPicture src={track.cover} shown={320} className="theater-cover-art" />
            ) : (
              <div className="theater-cover-empty muted" aria-hidden="true">
                ♪
              </div>
            )}
          </div>
          <div className="theater-info">
            <div className="theater-meta">
              <div
                className="theater-text"
                onClick={(event) => {
                  if (event.target instanceof Element && event.target.closest("a")) onClose();
                }}
              >
                <h2 className="theater-title" title={track.title}>
                  {!track.newSong ? (
                    <SongLink trackId={track.trackId}>{track.title}</SongLink>
                  ) : track.songId ? (
                    <SongLink trackId={track.trackId} songId={track.songId}>
                      {track.title}
                    </SongLink>
                  ) : track.albumHref ? (
                    <Link className="music-link" href={track.albumHref} prefetch={false}>
                      {track.title}
                    </Link>
                  ) : (
                    track.title
                  )}
                </h2>
                <p className="theater-subtitle muted" title={[track.artist, track.album].filter(Boolean).join(" · ")}>
                  <Link className="music-link" href={artistHref} prefetch={false}>
                    {track.artist}
                  </Link>
                  {track.album && albumHref && (
                    <>
                      {" · "}
                      <Link className="music-link" href={albumHref} prefetch={false}>
                        {track.album}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <PlayerLove artist={track.artist} title={track.title} enabled={canLove} />
            </div>
            {visualizer && <div className="theater-viz-wrap">{visualizer}</div>}
          </div>
        </div>

        {showLyrics && (
          <div className="theater-lyrics-col">
            <div ref={lyricsScrollRef} className="theater-lyrics-scroll">
              {lyricsBody}
              {lyrics && (
                <p className="muted lyrics-source">
                  {lyrics.source === "navidrome" ? "From your Navidrome" : "From LRCLIB"}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="theater-dock">
        {seek}
        <div className="theater-dock-bar">
          <div className="theater-dock-actions">{actions}</div>
          <div className="theater-controls">{transport}</div>
          <div className="theater-dock-volume">{volume}</div>
        </div>
      </footer>
    </section>
  );
}
