"use client";

import Link from "next/link";
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { albumIdFor, artistIdFor } from "@/lib/catalog";
import type { Repeat } from "@/lib/play-queue";
import {
  autoScrollStep,
  DRAG_THRESHOLD_PX,
  type DropIndicator,
  dropSlotForY,
  indicatorForSlot,
  type QueueRowRect,
  targetIndexForSlot,
} from "@/lib/queue-drag";
import { formatQueueSaved, MAX_PLAYLIST_NAME, type QueueSaveResult } from "@/lib/queue-playlist";
import CoverPicture from "./cover-picture";
import { SongLink } from "./music-links";
import type { PlayerTrack } from "./player";
import {
  DevicesIcon,
  ExpandIcon,
  LyricsIcon,
  NextIcon,
  PreviousIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
} from "./player-icons";
import PlayerLove from "./player-love";
import { PlayerVisualizer, PlayPauseButton, SeekBar } from "./player-transport";
import SleepTimer, { type Sleep } from "./sleep-timer";
import { useBarEntrance } from "./use-bar-entrance";
import VisibleList from "./visible-list";
import VolumeControl from "./volume-control";

const REPEAT_LABELS: Record<Repeat, string> = {
  off: "Repeat is off",
  all: "Repeating the queue",
  one: "Repeating this song",
};

type QueuePanelProps = {
  queue: PlayerTrack[];
  keys: (number | string)[];
  position: number;
  onClose: () => void;
  onJump: (at: number) => void;
  onRemove?: (at: number) => void;
  onMove?: (from: number, to: number) => void;
  onSavePlaylist?: (name: string) => Promise<QueueSaveResult>;
  title?: string;
};

type DragSession = {
  pointerId: number;
  from: number;
  trackId: string;
  title: string;
  artist: string;
  startY: number;
  clientY: number;
  offsetY: number;
  left: number;
  width: number;
  activated: boolean;
  slot: number | null;
  lastRendered: number;
};

type DragVisual = {
  from: number;
  title: string;
  artist: string;
  left: number;
  width: number;
  indicator: DropIndicator | null;
};

function panelTopBound(panel: HTMLElement, panelRect: DOMRect): number {
  const head = panel.querySelector<HTMLElement>(":scope > .section-head");
  return head ? Math.max(panelRect.top, head.getBoundingClientRect().bottom) : panelRect.top;
}

export function QueuePanel({
  queue,
  keys,
  position,
  onClose,
  onJump,
  onRemove,
  onMove,
  onSavePlaylist,
  title = "Queue",
}: QueuePanelProps) {
  const [savingOpen, setSavingOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [dragVisual, setDragVisual] = useState<DragVisual | null>(null);

  const panelRef = useRef<HTMLElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const ghostYRef = useRef(0);
  const suppressClickRef = useRef(false);
  const suppressResetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragRef = useRef<DragSession | null>(null);
  const scrollFrameRef = useRef(0);
  const listenersCleanupRef = useRef<(() => void) | null>(null);
  const latestRef = useRef({ queue, position, onMove });
  latestRef.current = { queue, position, onMove };

  const upcomingCount = Math.max(0, queue.length - position - 1);

  const measureTarget = useCallback((clientY: number, from: number) => {
    const panel = panelRef.current;
    if (!panel) return null;
    const { queue: currentQueue, position: currentPos } = latestRef.current;
    const minIndex = currentPos + 1;
    const maxIndex = currentQueue.length - 1;
    if (minIndex > maxIndex) return null;

    const rows: QueueRowRect[] = [];
    for (const item of panel.querySelectorAll<HTMLLIElement>("li[data-queue-index]")) {
      const index = Number(item.dataset.queueIndex);
      if (!Number.isInteger(index) || index < minIndex || index > maxIndex) continue;
      const rect = item.getBoundingClientRect();
      rows.push({ index, top: rect.top, bottom: rect.bottom });
    }
    if (rows.length === 0) return null;
    rows.sort((a, b) => a.index - b.index);
    const lastRendered = rows[rows.length - 1].index;
    const slot = dropSlotForY(rows, clientY, minIndex, maxIndex);
    const indicator = indicatorForSlot(from, slot, lastRendered);
    return { slot, lastRendered, indicator };
  }, []);

  const updateIndicator = useCallback(
    (drag: DragSession) => {
      const measured = measureTarget(drag.clientY, drag.from);
      if (!measured) return;
      drag.slot = measured.slot;
      drag.lastRendered = measured.lastRendered;
      setDragVisual((prev) => {
        if (!prev || prev.from !== drag.from) return prev;
        const same =
          prev.indicator?.index === measured.indicator?.index && prev.indicator?.edge === measured.indicator?.edge;
        return same ? prev : { ...prev, indicator: measured.indicator };
      });
    },
    [measureTarget],
  );

  const stopAutoScroll = useCallback(() => {
    if (scrollFrameRef.current) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = 0;
    }
  }, []);

  const tickAutoScroll = useCallback(() => {
    scrollFrameRef.current = 0;
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag?.activated || !panel) return;
    const panelRect = panel.getBoundingClientRect();
    const step = autoScrollStep(drag.clientY, panelTopBound(panel, panelRect), panelRect.bottom);
    if (step === 0) return;

    const before = panel.scrollTop;
    panel.scrollTop = before + step;
    if (panel.scrollTop !== before) updateIndicator(drag);
    scrollFrameRef.current = requestAnimationFrame(tickAutoScroll);
  }, [updateIndicator]);

  const syncAutoScroll = useCallback(() => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag?.activated || !panel) {
      stopAutoScroll();
      return;
    }
    const panelRect = panel.getBoundingClientRect();
    if (autoScrollStep(drag.clientY, panelTopBound(panel, panelRect), panelRect.bottom) !== 0) {
      if (!scrollFrameRef.current) {
        scrollFrameRef.current = requestAnimationFrame(tickAutoScroll);
      }
    } else {
      stopAutoScroll();
    }
  }, [stopAutoScroll, tickAutoScroll]);

  const clearDrag = useCallback(
    (commit: boolean) => {
      const drag = dragRef.current;
      dragRef.current = null;
      stopAutoScroll();
      listenersCleanupRef.current?.();
      listenersCleanupRef.current = null;
      if (drag?.activated) {
        try {
          if (panelRef.current?.hasPointerCapture?.(drag.pointerId)) {
            panelRef.current.releasePointerCapture(drag.pointerId);
          }
        } catch {}
        if (commit && drag.slot !== null) {
          const latest = latestRef.current;
          const valid =
            drag.from > latest.position &&
            drag.from < latest.queue.length &&
            latest.queue[drag.from]?.trackId === drag.trackId;
          if (valid) {
            const to = targetIndexForSlot(drag.from, drag.slot, latest.position + 1, latest.queue.length - 1);
            if (to !== drag.from) latest.onMove?.(drag.from, to);
          }
        }
        clearTimeout(suppressResetTimerRef.current);
        suppressResetTimerRef.current = setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
      setDragVisual(null);
    },
    [stopAutoScroll],
  );

  const activateDrag = useCallback(
    (drag: DragSession) => {
      if (drag.activated) return;
      drag.activated = true;
      suppressClickRef.current = true;
      ghostYRef.current = drag.clientY - drag.offsetY;
      try {
        panelRef.current?.setPointerCapture?.(drag.pointerId);
      } catch {}
      try {
        window.getSelection()?.removeAllRanges();
      } catch {}
      const measured = measureTarget(drag.clientY, drag.from);
      if (measured) {
        drag.slot = measured.slot;
        drag.lastRendered = measured.lastRendered;
      }
      setDragVisual({
        from: drag.from,
        title: drag.title,
        artist: drag.artist,
        left: drag.left,
        width: drag.width,
        indicator: measured?.indicator ?? null,
      });
    },
    [measureTarget],
  );

  function startRowPointer(event: ReactPointerEvent<HTMLLIElement>, at: number, track: PlayerTrack) {
    if (!event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    if (!(event.target instanceof Element) || event.target.closest(".queue-move, .queue-remove")) return;

    const fromHandle = Boolean(event.target.closest(".queue-grip"));
    if (event.pointerType === "touch" && !fromHandle) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const session: DragSession = {
      pointerId: event.pointerId,
      from: at,
      trackId: track.trackId,
      title: track.title,
      artist: track.artist,
      startY: event.clientY,
      clientY: event.clientY,
      offsetY: event.clientY - rect.top,
      left: rect.left,
      width: rect.width,
      activated: false,
      slot: at,
      lastRendered: at,
    };
    dragRef.current = session;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const current = dragRef.current;
      if (!current || moveEvent.pointerId !== current.pointerId) return;
      current.clientY = moveEvent.clientY;
      if (!current.activated) {
        if (Math.abs(moveEvent.clientY - current.startY) < DRAG_THRESHOLD_PX) return;
        activateDrag(current);
      }
      ghostYRef.current = moveEvent.clientY - current.offsetY;
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate3d(0, ${Math.round(ghostYRef.current)}px, 0)`;
      }
      updateIndicator(current);
      syncAutoScroll();
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== session.pointerId) return;
      clearDrag(true);
    };

    const onPointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== session.pointerId) return;
      clearDrag(false);
    };

    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      clearDrag(false);
    };

    const onBlur = () => clearDrag(false);

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    listenersCleanupRef.current = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
    };

    if (fromHandle) {
      event.preventDefault();
      activateDrag(session);
    }
  }

  useEffect(() => {
    return () => {
      clearTimeout(suppressResetTimerRef.current);
      dragRef.current = null;
      stopAutoScroll();
      listenersCleanupRef.current?.();
      listenersCleanupRef.current = null;
    };
  }, [stopAutoScroll]);

  useEffect(() => {
    const drag = dragRef.current;
    if (!drag) return;
    const stillMovable =
      Boolean(onMove) &&
      queue.length - position - 1 >= 2 &&
      drag.from > position &&
      drag.from < queue.length &&
      queue[drag.from]?.trackId === drag.trackId;
    if (!stillMovable) clearDrag(false);
  }, [queue, position, onMove, clearDrag]);

  async function handleSaveSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = playlistName.trim();
    if (!trimmed || !onSavePlaylist || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      const result = await onSavePlaylist(trimmed);
      setPlaylistName("");
      setSavingOpen(false);
      setSaveNotice(formatQueueSaved(result));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save playlist");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      ref={panelRef}
      className={dragVisual ? "queue-panel queue-dragging" : "queue-panel"}
      aria-label="Queue"
      onContextMenu={(event) => {
        if (dragRef.current?.activated || (event.target instanceof Element && event.target.closest(".queue-grip"))) {
          event.preventDefault();
        }
      }}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        clearTimeout(suppressResetTimerRef.current);
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="section-head">
        <h2>{title}</h2>
        <div className="queue-head-actions">
          {onSavePlaylist && queue.length > 0 && (
            <button
              type="button"
              className="secondary"
              aria-expanded={savingOpen}
              onClick={() => {
                setSavingOpen((open) => !open);
                setSaveError(null);
              }}
            >
              Save playlist
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {savingOpen && onSavePlaylist && (
        <form className="queue-save" onSubmit={handleSaveSubmit}>
          <input
            value={playlistName}
            onChange={(event) => setPlaylistName(event.target.value)}
            placeholder="New playlist name"
            aria-label="New playlist name"
            maxLength={MAX_PLAYLIST_NAME}
            disabled={saving}
            autoFocus
          />
          <button type="submit" disabled={saving || !playlistName.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      )}
      {saveError && (
        <p className="queue-save-note error" role="alert">
          {saveError}
        </p>
      )}
      {saveNotice && (
        <p className="queue-save-note muted" role="status">
          {saveNotice}
        </p>
      )}
      <VisibleList
        items={queue}
        guessedHeight={34}
        renderItem={(track, at) => {
          const canMoveRow = Boolean(onMove && at > position && upcomingCount >= 2);
          const isDragging = dragVisual?.from === at;
          const indicator = dragVisual?.indicator;
          const dragIndicator =
            indicator?.index === at ? (indicator.edge === "above" ? "drag-over-above" : "drag-over") : undefined;
          const rowClass =
            [
              at === position ? "current" : at < position ? "played" : undefined,
              isDragging ? "dragging" : undefined,
              dragIndicator,
            ]
              .filter(Boolean)
              .join(" ") || undefined;
          return (
            <li
              key={`${keys[at]}`}
              className={rowClass}
              data-queue-index={canMoveRow ? at : undefined}
              onPointerDown={canMoveRow ? (event) => startRowPointer(event, at, track) : undefined}
            >
              {canMoveRow && <span className="queue-grip" aria-hidden="true" title="Drag to reorder" />}
              <button type="button" className="queue-song" onClick={() => onJump(at)}>
                <span>{track.title}</span> <span className="muted">· {track.artist}</span>
              </button>
              {canMoveRow && (
                <>
                  <button
                    type="button"
                    className="queue-move"
                    aria-label={`Move ${track.title} up`}
                    disabled={at <= position + 1}
                    onClick={() => onMove?.(at, at - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="queue-move"
                    aria-label={`Move ${track.title} down`}
                    disabled={at >= queue.length - 1}
                    onClick={() => onMove?.(at, at + 1)}
                  >
                    ↓
                  </button>
                </>
              )}
              {onRemove && at !== position && (
                <button
                  type="button"
                  className="queue-remove"
                  aria-label={`Remove ${track.title} from the queue`}
                  onClick={() => onRemove(at)}
                >
                  ✕
                </button>
              )}
            </li>
          );
        }}
      />
      {dragVisual && (
        <div
          ref={ghostRef}
          className="queue-drag-ghost"
          aria-hidden="true"
          style={{
            left: dragVisual.left,
            width: dragVisual.width,
            transform: `translate3d(0, ${Math.round(ghostYRef.current)}px, 0)`,
          }}
        >
          <span className="queue-grip" aria-hidden="true" />
          <span className="queue-drag-ghost-text">
            <span>{dragVisual.title}</span> <span className="muted">· {dragVisual.artist}</span>
          </span>
        </div>
      )}
    </section>
  );
}

type PlayerBarProps = {
  away: boolean;
  current: PlayerTrack | null;
  position: number;
  length: number;
  full: boolean;
  error: string | null;
  shuffle: boolean;
  repeat: Repeat;
  hasNext: boolean;
  showQueue: boolean;
  showLyrics: boolean;
  showTheater: boolean;
  onLyrics: () => void;
  onTheater: () => void;
  audio: RefObject<HTMLAudioElement | null>;
  level: number;
  sleep: Sleep;
  onSleep: (sleep: Sleep) => void;
  live: RefObject<HTMLAudioElement | null>;
  holder: Ref<HTMLDivElement>;
  onShuffle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRepeat: () => void;
  onQueue: () => void;
  showDevices: boolean;
  elsewhere: boolean;
  onDevices: () => void;
  canLove: boolean;
};

export function PlayerBar({
  away,
  current,
  position,
  length,
  full,
  error,
  shuffle,
  repeat,
  hasNext,
  showQueue,
  showLyrics,
  showTheater,
  onLyrics,
  onTheater,
  audio,
  level,
  sleep,
  onSleep,
  live,
  holder,
  onShuffle,
  onPrevious,
  onNext,
  onRepeat,
  onQueue,
  showDevices,
  elsewhere,
  onDevices,
  canLove,
}: PlayerBarProps) {
  const entrance = useBarEntrance(Boolean(current) && !away);
  const fallbackArtistId = current ? artistIdFor(current.artist) : "";
  const artistHref = current
    ? (current.artistHref ??
      (fallbackArtistId
        ? `/artist/${encodeURIComponent(fallbackArtistId)}?name=${encodeURIComponent(current.artist)}`
        : `/music?q=${encodeURIComponent(current.artist)}`))
    : "";
  const fallbackAlbumId = current?.album ? albumIdFor(current.artist, current.album) : null;
  const albumHref = current?.album
    ? (current.albumHref ??
      (fallbackAlbumId
        ? `/album/${encodeURIComponent(fallbackAlbumId)}?artist=${encodeURIComponent(current.artist)}&title=${encodeURIComponent(current.album)}`
        : `/music?q=${encodeURIComponent(current.album)}`))
    : undefined;
  return (
    <div className={`player${entrance}`} hidden={!current || away}>
      <div className="player-song">
        {current?.cover && (
          <button
            type="button"
            className="player-cover-button"
            aria-label="Open now playing view"
            title="Now playing (F)"
            onClick={onTheater}
          >
            <CoverPicture src={current.cover} shown={48} />
          </button>
        )}
        {current && <PlayerVisualizer audio={live} paused={showTheater} />}
        <div className="now-playing">
          {current && (
            <>
              <strong title={current.title}>
                {!current.newSong ? (
                  <SongLink trackId={current.trackId}>{current.title}</SongLink>
                ) : current.songId ? (
                  <SongLink trackId={current.trackId} songId={current.songId}>
                    {current.title}
                  </SongLink>
                ) : current.albumHref ? (
                  <Link className="music-link" href={current.albumHref} prefetch={false}>
                    {current.title}
                  </Link>
                ) : (
                  current.title
                )}
              </strong>
              <span className="muted" title={[current.artist, current.album].filter(Boolean).join(" · ")}>
                <Link className="music-link" href={artistHref} prefetch={false}>
                  {current.artist}
                </Link>
                {current.album && albumHref && (
                  <>
                    {" · "}
                    <Link className="music-link" href={albumHref} prefetch={false}>
                      {current.album}
                    </Link>
                  </>
                )}
                {!full && " · 30-second preview"}
                {length > 1 && ` · ${position + 1} of ${length}`}
              </span>
            </>
          )}
          {error && <span className="error">{error}</span>}
        </div>
        {current && <PlayerLove artist={current.artist} title={current.title} enabled={canLove} />}
      </div>
      <div className="player-center">
        <div className="player-skip">
          <button
            type="button"
            className="icon-button player-toggle"
            data-player="shuffle"
            aria-label="Shuffle"
            aria-pressed={shuffle}
            title={shuffle ? "Shuffle is on (S)" : "Shuffle is off (S)"}
            onClick={onShuffle}
          >
            <ShuffleIcon size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            data-player="previous"
            aria-label="Previous song"
            title="Previous song (Shift+←)"
            onClick={onPrevious}
          >
            <PreviousIcon />
          </button>
          <PlayPauseButton audio={live} />
          <button
            type="button"
            className="icon-button"
            data-player="next"
            aria-label="Next song"
            title="Next song (Shift+→)"
            onClick={onNext}
            disabled={!hasNext}
          >
            <NextIcon />
          </button>
          <button
            type="button"
            className="icon-button player-toggle"
            data-player="repeat"
            data-repeat={repeat}
            aria-label={REPEAT_LABELS[repeat]}
            aria-pressed={repeat !== "off"}
            title={`${REPEAT_LABELS[repeat]} (R)`}
            onClick={onRepeat}
          >
            <RepeatIcon size={18} one={repeat === "one"} />
          </button>
        </div>
        <SeekBar audio={live} known={current?.duration} />
      </div>
      <div className="player-side">
        <button
          type="button"
          className="icon-button player-toggle"
          data-player="queue"
          aria-label="Queue"
          aria-expanded={showQueue}
          aria-pressed={showQueue}
          title="Queue (Q)"
          onClick={onQueue}
        >
          <QueueIcon size={18} />
        </button>
        <button
          type="button"
          className="icon-button player-toggle"
          data-player="lyrics"
          aria-label="Lyrics"
          aria-expanded={showLyrics}
          aria-pressed={showLyrics}
          title="Lyrics (L)"
          onClick={onLyrics}
        >
          <LyricsIcon size={18} />
        </button>
        <button
          type="button"
          className="icon-button player-toggle"
          data-player="theater"
          aria-label="Now playing view"
          aria-expanded={showTheater}
          aria-pressed={showTheater}
          title="Now playing (F)"
          onClick={onTheater}
        >
          <ExpandIcon size={18} />
        </button>
        <button
          type="button"
          className={elsewhere ? "icon-button player-toggle active" : "icon-button player-toggle"}
          data-player="devices"
          aria-label={elsewhere ? "Devices, playing on another device" : "Devices"}
          aria-expanded={showDevices}
          aria-pressed={showDevices}
          title="Devices"
          onClick={onDevices}
        >
          <DevicesIcon size={18} />
        </button>
        <SleepTimer sleep={sleep} onChoose={onSleep} />
        <VolumeControl audio={audio} level={level} />
      </div>
      <div className="player-audio" ref={holder} />
    </div>
  );
}
