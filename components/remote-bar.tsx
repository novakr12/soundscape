"use client";

import { type RefObject, useEffect, useState } from "react";
import { type Device, type DeviceCommand, type Guess, shownPlayback } from "@/lib/devices";
import { SEEK_STEP_SECONDS } from "@/lib/play-queue";
import { clock, KindIcon, useLater } from "./devices";
import { SongLink } from "./music-links";
import { DevicesIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./player-icons";

export default function RemoteBar({
  device,
  offset,
  send,
  onPlayHere,
  onDevices,
  showDevices,
  keys,
}: {
  device: Device;
  offset: number;
  send: (command: DeviceCommand) => void;
  onPlayHere: () => void;
  onDevices: () => void;
  showDevices: boolean;
  keys: RefObject<(shortcut: string) => boolean>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [guess, setGuess] = useState<Guess | null>(null);
  const [seeking, setSeeking] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (device.at > 0) setGuess(null);
  }, [device.at]);

  const state = device.state;
  const track = state.track;
  const shown = shownPlayback(device, now + offset, guess, now);
  const length = state.duration ?? 0;
  const at = seeking ?? (length > 0 ? Math.min(shown.time, length) : shown.time);
  const shownVolume = volume ?? state.volume;

  const seekLater = useLater((value) => {
    send({ do: "seek", time: value });
    setGuess({ playing: shown.playing, time: value, since: Date.now() });
    setSeeking(null);
  });
  const volumeLater = useLater((value) => {
    send({ do: "volume", volume: value });
    setTimeout(() => setVolume(null), 2000);
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

  return (
    <div className="player remote-player" data-remote={device.id}>
      <div className="player-song">
        {track?.cover && <img src={track.cover} alt="" width={48} height={48} />}
        <div className="now-playing">
          {track ? (
            <>
              <strong title={track.title}>
                <SongLink trackId={track.trackId}>{track.title}</SongLink>
              </strong>
              <span className="muted" title={[track.artist, track.album].filter(Boolean).join(" · ")}>
                {track.artist}
                {track.album && ` · ${track.album}`}
              </span>
            </>
          ) : (
            <strong>Nothing playing</strong>
          )}
          <span className="remote-where">
            <KindIcon kind={device.kind} />
            Playing on {device.name}
          </span>
        </div>
      </div>
      <div className="player-center">
        <div className="player-skip">
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
        </div>
        <div className="player-seek">
          <span className="player-time">{clock(at)}</span>
          <input
            type="range"
            min={0}
            max={length || 1}
            step={1}
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
        <button type="button" className="secondary remote-here" onClick={onPlayHere} disabled={!track}>
          Play here
        </button>
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
              setVolume(value);
              volumeLater(value);
            }}
          />
        </div>
      </div>
    </div>
  );
}
