"use client";

import Link from "next/link";
import { type RefObject, useEffect, useState } from "react";
import {
  type Device,
  type DeviceCommand,
  GUESS_KEEP_MS,
  type Guess,
  type RepeatMode,
  shownPlayback,
} from "@/lib/devices";
import { nextRepeat, SEEK_STEP_SECONDS } from "@/lib/play-queue";
import CoverPicture from "./cover-picture";
import { clock, KindIcon, useLater, useResetTimer } from "./devices";
import { ArtistLink, SongLink } from "./music-links";
import {
  DevicesIcon,
  LyricsIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
} from "./player-icons";
import { useBarEntrance } from "./use-bar-entrance";
import { useNow } from "./use-now";

const REPEAT_LABELS: Record<RepeatMode, string> = {
  off: "Repeat is off",
  all: "Repeating the queue",
  one: "Repeating this song",
};

export default function RemoteBar({
  device,
  here = false,
  offset,
  send,
  onPlayHere,
  onDevices,
  showDevices,
  keys,
  showQueue,
  showLyrics,
  onQueue,
  onLyrics,
}: {
  device: Device;
  here?: boolean;
  offset: number;
  send: (command: DeviceCommand) => void;
  onPlayHere: () => void;
  onDevices: () => void;
  showDevices: boolean;
  keys: RefObject<(shortcut: string) => boolean>;
  showQueue: boolean;
  showLyrics: boolean;
  onQueue: () => void;
  onLyrics: () => void;
}) {
  const [asked, setAsked] = useState<{ shuffle?: boolean; repeat?: RepeatMode; since: number } | null>(null);
  const now = useNow(500);
  const [guess, setGuess] = useState<Guess | null>(null);
  const [seeking, setSeeking] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);

  useEffect(() => {
    if (device.at > 0) {
      setGuess(null);
      setAsked(null);
    }
  }, [device.at]);

  const state = device.state;
  const track = state.track;
  const shown = shownPlayback(device, now + offset, guess, now);
  const length = state.duration ?? 0;
  const at = seeking ?? (length > 0 ? Math.min(shown.time, length) : shown.time);
  const shownVolume = volume ?? state.volume;
  const fresh = asked && now - asked.since < GUESS_KEEP_MS ? asked : null;
  const shuffle = fresh?.shuffle ?? state.shuffle;
  const repeat = fresh?.repeat ?? state.repeat;

  const volumeReset = useResetTimer(2000);
  const seekLater = useLater((value) => {
    send({ do: "seek", time: value });
    setGuess({ playing: shown.playing, time: value, since: Date.now() });
    setSeeking(null);
  });
  const volumeLater = useLater((value) => {
    send({ do: "volume", volume: value });
    volumeReset.schedule(() => setVolume(null));
  });

  function toggle() {
    const playing = !shown.playing;
    send({ do: playing ? "play" : "pause" });
    setGuess({ playing, time: shown.time, since: Date.now() });
  }

  function skip(command: "next" | "previous") {
    send({ do: command });
    setGuess({ playing: true, time: 0, since: Date.now() });
  }

  function seekBy(step: number) {
    const time = Math.max(0, length > 0 ? Math.min(shown.time + step, length) : shown.time + step);
    send({ do: "seek", time });
    setGuess({ playing: shown.playing, time, since: Date.now() });
  }

  keys.current = (shortcut) => {
    if (!track) return false;
    if (shortcut === "toggle") toggle();
    else if (shortcut === "next" || shortcut === "previous") skip(shortcut);
    else seekBy(shortcut === "back" ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS);
    return true;
  };

  useEffect(
    () => () => {
      keys.current = () => false;
    },
    [keys],
  );
  const entrance = useBarEntrance(true);

  return (
    <div
      className={`${here ? "player" : "player remote-player"}${entrance}`}
      data-remote={device.id}
      data-here={here || undefined}
    >
      <div className="player-song">
        {track?.cover && <CoverPicture src={track.cover} shown={48} />}
        <div className="now-playing">
          {track ? (
            <>
              <strong title={track.title}>
                <SongLink trackId={track.trackId}>{track.title}</SongLink>
              </strong>
              <span className="muted" title={[track.artist, track.album].filter(Boolean).join(" · ")}>
                {track.artistHref ? (
                  <Link className="music-link" href={track.artistHref}>
                    {track.artist}
                  </Link>
                ) : (
                  <ArtistLink name={track.artist} />
                )}
                {track.album && " · "}
                {track.album &&
                  (track.albumHref ? (
                    <Link className="music-link" href={track.albumHref}>
                      {track.album}
                    </Link>
                  ) : (
                    track.album
                  ))}
              </span>
            </>
          ) : (
            <strong>Nothing playing</strong>
          )}
          {!here && (
            <span className="remote-where">
              <KindIcon kind={device.kind} />
              <span>Playing on {device.name}</span>
            </span>
          )}
        </div>
      </div>
      <div className="player-center">
        <div className="player-skip">
          {shuffle !== null && (
            <button
              type="button"
              className="icon-button player-toggle"
              data-player="shuffle"
              aria-label={`Shuffle on ${device.name}`}
              aria-pressed={shuffle}
              title={shuffle ? "Shuffle is on" : "Shuffle is off"}
              onClick={() => {
                send({ do: "shuffle", on: !shuffle });
                setAsked({ ...fresh, shuffle: !shuffle, since: now });
              }}
            >
              <ShuffleIcon size={18} />
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            data-player="previous"
            aria-label={`Previous song on ${device.name}`}
            disabled={!track}
            onClick={() => skip("previous")}
          >
            <PreviousIcon />
          </button>
          <button
            type="button"
            className="player-play"
            data-player="play"
            aria-label={shown.playing ? `Pause on ${device.name}` : `Play on ${device.name}`}
            disabled={!track}
            onClick={toggle}
          >
            {shown.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          <button
            type="button"
            className="icon-button"
            data-player="next"
            aria-label={`Next song on ${device.name}`}
            disabled={!track}
            onClick={() => skip("next")}
          >
            <NextIcon />
          </button>
          {repeat !== null && (
            <button
              type="button"
              className="icon-button player-toggle"
              data-player="repeat"
              data-repeat={repeat}
              aria-label={`Repeat on ${device.name}: ${repeat}`}
              aria-pressed={repeat !== "off"}
              title={REPEAT_LABELS[repeat]}
              onClick={() => {
                const mode = nextRepeat(repeat);
                send({ do: "repeat", mode });
                setAsked({ ...fresh, repeat: mode, since: now });
              }}
            >
              <RepeatIcon size={18} one={repeat === "one"} />
            </button>
          )}
        </div>
        <div className="player-seek">
          <span className="player-time">{clock(at)}</span>
          <input
            type="range"
            min={0}
            max={length || 1}
            step="any"
            value={at}
            disabled={length === 0}
            aria-label={`Seek on ${device.name}`}
            aria-valuetext={`${clock(at)} of ${clock(length)}`}
            style={{ "--fill": `${length > 0 ? (at / length) * 100 : 0}%` } as React.CSSProperties}
            onChange={(event) => {
              const value = Number(event.target.value);
              setSeeking(value);
              seekLater(value);
            }}
          />
          <span className="player-time">{clock(length)}</span>
        </div>
      </div>
      <div className="player-side">
        {!here && (
          <button type="button" className="secondary remote-here" onClick={onPlayHere} disabled={!track}>
            Play here
          </button>
        )}
        {state.upNext.length > 0 && (
          <button
            type="button"
            className="icon-button player-toggle"
            data-player="queue"
            aria-label={`Queue on ${device.name}`}
            aria-expanded={showQueue}
            aria-pressed={showQueue}
            title="Queue"
            onClick={onQueue}
          >
            <QueueIcon size={18} />
          </button>
        )}
        {track && (
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
        )}
        <button
          type="button"
          className="icon-button player-toggle active"
          data-player="devices"
          aria-label="Devices"
          aria-expanded={showDevices}
          aria-pressed={showDevices}
          title="Devices"
          onClick={onDevices}
        >
          <DevicesIcon size={18} />
        </button>
        <div className="volume">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={shownVolume}
            aria-label={`Volume on ${device.name}`}
            style={{ "--fill": `${Math.round(shownVolume * 100)}%` } as React.CSSProperties}
            onChange={(event) => {
              const value = Number(event.target.value);
              volumeReset.cancel();
              setVolume(value);
              volumeLater(value);
            }}
          />
        </div>
      </div>
    </div>
  );
}
