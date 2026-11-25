"use client";

import Link from "next/link";
import { type RefObject, useEffect, useRef, useState } from "react";
import { albumIdFor, artistIdFor } from "@/lib/catalog";
import {
  type Device,
  type DeviceCommand,
  GUESS_KEEP_MS,
  type Guess,
  type RepeatMode,
  shownPlayback,
} from "@/lib/devices";
import { nextRepeat, SEEK_STEP_SECONDS, type Shortcut } from "@/lib/play-queue";
import { stepVolume, toggleMuteVolume, VOLUME_KEY_STEP } from "@/lib/volume";
import CoverPicture from "./cover-picture";
import { clock, KindIcon, useLater, usePaced, useResetTimer } from "./devices";
import { SongLink } from "./music-links";
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
import PlayerLove from "./player-love";
import { PlayerVisualizer } from "./player-transport";
import SleepTimer, { type Sleep } from "./sleep-timer";
import { useBarEntrance } from "./use-bar-entrance";
import { useNow } from "./use-now";
import { VolumeBar } from "./volume-control";

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
  canLove,
}: {
  device: Device;
  here?: boolean;
  offset: number;
  send: (command: DeviceCommand) => void;
  onPlayHere: () => void;
  onDevices: () => void;
  showDevices: boolean;
  keys: RefObject<(shortcut: Shortcut) => boolean>;
  showQueue: boolean;
  showLyrics: boolean;
  onQueue: () => void;
  onLyrics: () => void;
  canLove: boolean;
}) {
  const [asked, setAsked] = useState<{
    shuffle?: boolean;
    repeat?: RepeatMode;
    sleep?: Sleep;
    since: number;
  } | null>(null);
  const now = useNow(500);
  const [guess, setGuess] = useState<Guess | null>(null);
  const [seeking, setSeeking] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const [volumePeek, setVolumePeek] = useState(0);
  const beforeMute = useRef(0.8);

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
  if (shownVolume > 0) beforeMute.current = shownVolume;
  const fresh = asked && now - asked.since < GUESS_KEEP_MS ? asked : null;
  const shuffle = fresh?.shuffle ?? state.shuffle;
  const repeat = fresh?.repeat ?? state.repeat;
  const remoteSleep: Sleep =
    state.sleep?.kind === "song"
      ? { kind: "song" }
      : state.sleep?.kind === "time"
        ? { kind: "time", until: device.at - offset + state.sleep.left * 1000 }
        : null;
  const sleep = fresh?.sleep !== undefined ? fresh.sleep : remoteSleep;

  const volumeReset = useResetTimer(2000);
  const seekLater = useLater((value) => {
    send({ do: "seek", time: value });
    setGuess({ playing: shown.playing, time: value, since: Date.now() });
    setSeeking(null);
  });
  const volumeLive = usePaced(
    (value) => {
      send({ do: "volume", volume: value });
      volumeReset.schedule(() => setVolume(null));
    },
    here ? 25 : 150,
  );

  function applyVolume(next: number, flash = false) {
    volumeReset.cancel();
    setVolume(next);
    volumeLive(next);
    if (flash) setVolumePeek((n) => n + 1);
  }

  function toggleMute() {
    const next = toggleMuteVolume(shownVolume, beforeMute.current);
    beforeMute.current = next.remembered;
    applyVolume(next.volume, true);
  }

  function stepRemoteVolume(delta: number) {
    applyVolume(stepVolume(shownVolume, delta), true);
  }

  function toggleShuffle() {
    if (shuffle === null) return;
    send({ do: "shuffle", on: !shuffle });
    setAsked({ ...fresh, shuffle: !shuffle, since: now });
  }

  function cycleRepeat() {
    if (repeat === null) return;
    const mode = nextRepeat(repeat);
    send({ do: "repeat", mode });
    setAsked({ ...fresh, repeat: mode, since: now });
  }

  function chooseSleep(next: Sleep) {
    if (next === null) send({ do: "sleep", kind: "off" });
    else if (next.kind === "song") send({ do: "sleep", kind: "song" });
    else send({ do: "sleep", kind: "time", seconds: Math.max(1, Math.round((next.until - Date.now()) / 1000)) });
    setAsked({ ...fresh, sleep: next, since: now });
  }

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
    if (shortcut === "mute") {
      toggleMute();
      return true;
    }
    if (shortcut === "volume-up" || shortcut === "volume-down") {
      stepRemoteVolume(shortcut === "volume-up" ? VOLUME_KEY_STEP : -VOLUME_KEY_STEP);
      return true;
    }
    if (shortcut === "shuffle") {
      if (shuffle === null) return false;
      toggleShuffle();
      return true;
    }
    if (shortcut === "repeat") {
      if (repeat === null) return false;
      cycleRepeat();
      return true;
    }
    if (shortcut === "queue") {
      if (state.upNext.length === 0) return false;
      onQueue();
      return true;
    }
    if (!track) return false;
    if (shortcut === "lyrics") onLyrics();
    else if (shortcut === "toggle") toggle();
    else if (shortcut === "next" || shortcut === "previous") skip(shortcut);
    else if (shortcut === "back" || shortcut === "forward")
      seekBy(shortcut === "back" ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS);
    else return false;
    return true;
  };

  useEffect(
    () => () => {
      keys.current = () => false;
    },
    [keys],
  );
  const entrance = useBarEntrance(true);
  const fallbackArtistId = track ? artistIdFor(track.artist) : "";
  const artistHref = track
    ? (track.artistHref ??
      (fallbackArtistId
        ? `/artist/${encodeURIComponent(fallbackArtistId)}?name=${encodeURIComponent(track.artist)}`
        : `/music?q=${encodeURIComponent(track.artist)}`))
    : "";
  const fallbackAlbumId = track?.album ? albumIdFor(track.artist, track.album) : null;
  const albumHref = track?.album
    ? (track.albumHref ??
      (fallbackAlbumId
        ? `/album/${encodeURIComponent(fallbackAlbumId)}?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.album)}`
        : `/music?q=${encodeURIComponent(track.album)}`))
    : undefined;

  return (
    <div
      className={`${here ? "player" : "player remote-player"}${entrance}`}
      data-remote={device.id}
      data-here={here || undefined}
    >
      <div className="player-song">
        {track?.cover && <CoverPicture src={track.cover} shown={48} />}
        {here && track && <PlayerVisualizer playing={shown.playing} />}
        <div className="now-playing">
          {track ? (
            <>
              <strong title={track.title}>
                <SongLink trackId={track.trackId} songId={track.songId ?? undefined}>
                  {track.title}
                </SongLink>
              </strong>
              <span className="muted" title={[track.artist, track.album].filter(Boolean).join(" · ")}>
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
        {track && <PlayerLove artist={track.artist} title={track.title} enabled={canLove} />}
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
              title={shuffle ? "Shuffle is on (S)" : "Shuffle is off (S)"}
              onClick={toggleShuffle}
            >
              <ShuffleIcon size={18} />
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            data-player="previous"
            aria-label={`Previous song on ${device.name}`}
            title="Previous song (Shift+←)"
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
            title="Next song (Shift+→)"
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
              title={`${REPEAT_LABELS[repeat]} (R)`}
              onClick={cycleRepeat}
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
            title="Queue (Q)"
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
            title="Lyrics (L)"
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
        {track && (here || device.kind !== "android") && <SleepTimer sleep={sleep} onChoose={chooseSleep} />}
        <VolumeBar
          value={shownVolume}
          onChange={(value) => applyVolume(value)}
          onToggleMute={toggleMute}
          sliderLabel={`Volume on ${device.name}`}
          muteLabel={`Mute ${device.name}`}
          unmuteLabel={`Unmute ${device.name}`}
          peekKey={volumePeek}
        />
      </div>
    </div>
  );
}
