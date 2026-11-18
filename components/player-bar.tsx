"use client";

import Link from "next/link";
import type { Ref, RefObject } from "react";
import type { Repeat } from "@/lib/play-queue";
import { ArtistLink, SongLink } from "./music-links";
import type { PlayerTrack } from "./player";
import { DevicesIcon, LyricsIcon, NextIcon, PreviousIcon, QueueIcon, RepeatIcon, ShuffleIcon } from "./player-icons";
import { PlayPauseButton, SeekBar } from "./player-transport";
import SleepTimer, { type Sleep } from "./sleep-timer";
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
  title?: string;
};

export function QueuePanel({ queue, keys, position, onClose, onJump, onRemove, title = "Queue" }: QueuePanelProps) {
  return (
    <section className="queue-panel" aria-label="Queue">
      <div className="section-head">
        <h2>{title}</h2>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <ol>
        {queue.map((track, at) => (
          <li key={`${keys[at]}`} className={at === position ? "current" : at < position ? "played" : undefined}>
            <button type="button" className="queue-song" onClick={() => onJump(at)}>
              <span>{track.title}</span> <span className="muted">· {track.artist}</span>
            </button>
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
        ))}
      </ol>
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
  onLyrics: () => void;
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
  onLyrics,
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
}: PlayerBarProps) {
  return (
    <div className="player" hidden={!current || away}>
      <div className="player-song">
        {current?.cover && <img src={current.cover} alt="" width={48} height={48} />}
        <div className="now-playing">
          {current && (
            <>
              <strong title={current.title}>
                {current.newSong ? current.title : <SongLink trackId={current.trackId}>{current.title}</SongLink>}
              </strong>
              <span className="muted" title={[current.artist, current.album].filter(Boolean).join(" · ")}>
                {current.artistHref ? (
                  <Link className="music-link" href={current.artistHref}>
                    {current.artist}
                  </Link>
                ) : current.newSong ? (
                  <Link className="music-link" href={`/music?q=${encodeURIComponent(current.artist)}`}>
                    {current.artist}
                  </Link>
                ) : (
                  <ArtistLink name={current.artist} />
                )}
                {current.album && " · "}
                {current.album &&
                  (current.albumHref ? (
                    <Link className="music-link" href={current.albumHref}>
                      {current.album}
                    </Link>
                  ) : (
                    current.album
                  ))}
                {!full && " · 30-second preview"}
                {length > 1 && ` · ${position + 1} of ${length}`}
              </span>
            </>
          )}
          {error && <span className="error">{error}</span>}
        </div>
      </div>
      <div className="player-center">
        <div className="player-skip">
          <button
            type="button"
            className="icon-button player-toggle"
            data-player="shuffle"
            aria-label="Shuffle"
            aria-pressed={shuffle}
            title={shuffle ? "Shuffle is on" : "Shuffle is off"}
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
            title={REPEAT_LABELS[repeat]}
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
          title="Queue"
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
          title="Lyrics"
          onClick={onLyrics}
        >
          <LyricsIcon size={18} />
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
