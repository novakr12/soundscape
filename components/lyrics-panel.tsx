"use client";

import { type RefObject, useEffect, useRef } from "react";
import type { PlayerTrack } from "./player";
import { useLyrics } from "./use-lyrics";

export default function LyricsPanel({
  track,
  time,
  playing,
  audio,
  onSeek,
  onClose,
}: {
  track: PlayerTrack;
  time: () => number;
  playing?: boolean;
  audio?: RefObject<HTMLAudioElement | null>;
  onSeek: (seconds: number) => void;
  onClose: () => void;
}) {
  const { loading, failed, lyrics, activeLine: at } = useLyrics({ track, time, playing, audio });
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const body = document.body;
    const bar = document.querySelector<HTMLElement>(".player:not([hidden])");
    const measure = () => body.style.setProperty("--player-height", `${bar?.offsetHeight ?? 0}px`);
    measure();
    const watcher = bar ? new ResizeObserver(measure) : null;
    if (bar) watcher?.observe(bar);
    body.classList.add("lyrics-open");
    return () => {
      watcher?.disconnect();
      body.classList.remove("lyrics-open");
      body.style.removeProperty("--player-height");
    };
  }, []);

  useEffect(() => {
    const box = list.current?.parentElement;
    const line = list.current?.children[at] as HTMLElement | undefined;
    if (!box || !line) return;
    box.scrollTo({ top: line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2, behavior: "smooth" });
  }, [at]);

  function seek(seconds: number | undefined) {
    if (seconds !== undefined) onSeek(seconds);
  }

  return (
    <section className="queue-panel lyrics-panel" aria-label="Lyrics">
      <div className="section-head">
        <h2>Lyrics</h2>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
      {loading ? (
        <p className="muted">Looking for lyrics…</p>
      ) : failed ? (
        <p className="muted">Lyrics couldn&apos;t be loaded right now.</p>
      ) : !lyrics ? (
        <p className="muted">No lyrics found for this song.</p>
      ) : lyrics.instrumental ? (
        <p className="muted">Instrumental</p>
      ) : (
        <ol ref={list} className={lyrics.synced ? "lyrics synced" : "lyrics"}>
          {lyrics.lines.map((line, i) => (
            <li key={`${i}-${line.at ?? ""}`} className={i === at ? "current" : i < at ? "sung" : undefined}>
              {lyrics.synced ? (
                <button type="button" onClick={() => seek(line.at)}>
                  {line.text || "♪"}
                </button>
              ) : (
                line.text || " "
              )}
            </li>
          ))}
        </ol>
      )}
      {lyrics && (
        <p className="muted lyrics-source">{lyrics.source === "navidrome" ? "From your Navidrome" : "From LRCLIB"}</p>
      )}
    </section>
  );
}
