"use client";

import { useEffect, useRef, useState } from "react";
import { currentLine, type Lyrics } from "@/lib/lyrics-text";
import type { PlayerTrack } from "./player";

const REFRESH_MS = 250;

type State = { key: string; lyrics: Lyrics | null } | { key: string; loading: true } | { key: string; failed: true };

function keyOf(track: PlayerTrack) {
  return `${track.trackId}|${track.songId ?? ""}`;
}

export default function LyricsPanel({
  track,
  time,
  onSeek,
  onClose,
}: {
  track: PlayerTrack;
  time: () => number;
  onSeek: (seconds: number) => void;
  onClose: () => void;
}) {
  const clock = useRef(time);
  clock.current = time;
  const [state, setState] = useState<State>({ key: keyOf(track), loading: true });
  const [at, setAt] = useState(-1);
  const list = useRef<HTMLOListElement>(null);
  const key = keyOf(track);

  useEffect(() => {
    const params = new URLSearchParams({ trackId: track.trackId, title: track.title, artist: track.artist });
    if (track.songId) params.set("songId", track.songId);
    if (track.album) params.set("album", track.album);
    let live = true;
    setState({ key, loading: true });
    setAt(-1);
    fetch(`/api/lyrics?${params}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((answer: { lyrics: Lyrics | null }) => live && setState({ key, lyrics: answer.lyrics }))
      .catch(() => live && setState({ key, failed: true }));
    return () => {
      live = false;
    };
  }, [key, track.trackId, track.songId, track.title, track.artist, track.album]);

  const lyrics = "lyrics" in state && state.key === key ? state.lyrics : null;

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
    if (!lyrics?.synced) return;
    const tick = () => setAt(currentLine(lyrics.lines, clock.current()));
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => clearInterval(timer);
  }, [lyrics]);

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
      {"loading" in state || state.key !== key ? (
        <p className="muted">Looking for lyrics…</p>
      ) : "failed" in state ? (
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
