"use client";

import { useRef, useState } from "react";
import { type PlayerTrack, useCurrentTrackId, usePlayerActions } from "./player";
import PlaylistPicker from "./playlist-picker";

export default function PlayButton({ track, onPlay }: { track: PlayerTrack; onPlay?: () => void }) {
  const { play, playNext, addToQueue } = usePlayerActions();
  const currentTrackId = useCurrentTrackId();
  const menu = useRef<HTMLDetailsElement>(null);
  const isCurrent = currentTrackId === track.trackId;
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function choose(action: (track: PlayerTrack) => void) {
    action(track);
    if (menu.current) menu.current.open = false;
  }

  function finished(message: string) {
    setPicking(false);
    setNote(message);
    if (menu.current) menu.current.open = false;
    setTimeout(() => setNote(null), 4000);
  }

  return (
    <span className="play-controls">
      <button type="button" onClick={() => (onPlay ? onPlay() : play(track))} aria-pressed={isCurrent}>
        {isCurrent ? "♪ Playing" : "▶ Play"}
      </button>
      <details
        className="queue-menu"
        ref={menu}
        onToggle={(event) => {
          const isOpen = event.currentTarget.open;
          setOpen(isOpen);
          if (!isOpen) setPicking(false);
        }}
      >
        <summary aria-label={`More for ${track.title}`} title="Play next, add to the queue or to a playlist">
          ⋯
        </summary>
        {open && (
          <div className="queue-menu-items">
            {picking ? (
              <PlaylistPicker track={track} onDone={finished} />
            ) : (
              <>
                <button type="button" onClick={() => choose(playNext)}>
                  Play next
                </button>
                <button type="button" onClick={() => choose(addToQueue)}>
                  Add to queue
                </button>
                <button type="button" onClick={() => setPicking(true)}>
                  Add to playlist…
                </button>
              </>
            )}
          </div>
        )}
      </details>
      {note && (
        <span className="muted play-note" role="status">
          {note}
        </span>
      )}
    </span>
  );
}
