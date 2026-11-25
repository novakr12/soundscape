"use client";

import Link from "next/link";
import { type FormEvent, type Ref, type RefObject, useState } from "react";
import { albumIdFor, artistIdFor } from "@/lib/catalog";
import type { Repeat } from "@/lib/play-queue";
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
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const upcomingCount = Math.max(0, queue.length - position - 1);

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
    <section className="queue-panel" aria-label="Queue">
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
          const dragIndicator =
            dragOver === at && dragFrom !== null && dragFrom !== at
              ? dragFrom > at
                ? "drag-over-above"
                : "drag-over"
              : undefined;
          const rowClass =
            [at === position ? "current" : at < position ? "played" : undefined, dragIndicator]
              .filter(Boolean)
              .join(" ") || undefined;
          return (
            <li
              key={`${keys[at]}`}
              className={rowClass}
              draggable={canMoveRow}
              onDragStart={
                canMoveRow
                  ? (event) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDragFrom(at);
                      setDragOver(at);
                    }
                  : undefined
              }
              onDragOver={
                dragFrom !== null && at > position
                  ? (event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dragOver !== at) setDragOver(at);
                    }
                  : undefined
              }
              onDrop={
                dragFrom !== null && at > position
                  ? (event) => {
                      event.preventDefault();
                      const from = dragFrom;
                      setDragFrom(null);
                      setDragOver(null);
                      if (from !== at) onMove?.(from, at);
                    }
                  : undefined
              }
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
            >
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
