"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import {
  type AppView,
  DEVICE_HEARTBEAT_MS,
  type Device,
  type DeviceCommand,
  type DeviceKind,
  type DeviceState,
  deviceKind,
  deviceName,
  givenDevice,
  isHeld,
  isOnline,
  newDeviceId,
  nowPlayingLine,
  timeNow,
} from "@/lib/devices";
import { type PartyControls, PartySection } from "./listening-party";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./player-icons";
import { useNow } from "./use-now";

export type LocalPlayer = {
  state: () => DeviceState;
  obey: (command: DeviceCommand) => void;
};

export type DeviceLink = {
  me: { id: string; name: string } | null;
  devices: Device[];
  offset: number;
  send: (to: string, command: DeviceCommand) => Promise<string | null>;
  report: () => void;
};

function appView() {
  return window as Window & AppView;
}

const ID_KEY = "soundscape:device-id";
const REPORT_AFTER_MS = 400;
const MEDIA_EVENTS = ["play", "pause", "seeked", "loadedmetadata", "volumechange", "emptied", "ended"];

function deviceId() {
  const given = givenDevice(appView()).id;
  if (given) return given;
  try {
    const saved = sessionStorage.getItem(ID_KEY);
    if (saved) return saved;
    const made = newDeviceId();
    sessionStorage.setItem(ID_KEY, made);
    return made;
  } catch {
    return newDeviceId();
  }
}

export function useDeviceLink(local: RefObject<LocalPlayer>, username: string | null): DeviceLink {
  const [me, setMe] = useState<{ id: string; name: string; kind: DeviceKind } | null>(null);
  const [devices, setDevices] = useState<Map<string, Device>>(new Map());
  const [offset, setOffset] = useState(0);
  const reportRef = useRef<() => void>(() => {});

  useEffect(() => {
    setDevices(new Map());
    setMe(null);
    if (!username) return;
    const kind = deviceKind(window as Window & { soundscapeDesktop?: unknown }, navigator.userAgent);
    const self = { id: deviceId(), name: givenDevice(appView()).name ?? deviceName(kind, navigator.userAgent), kind };
    let stopped = false;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const learnClock = (serverNow: unknown) => {
      if (typeof serverNow === "number") setOffset(serverNow - Date.now());
    };
    const keep = (device: Device) => {
      if (device.id === self.id) return;
      setDevices((before) => new Map(before).set(device.id, device));
    };
    const report = async () => {
      if (stopped || isHeld(appView())) return;
      const response = await fetch("/api/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...self, state: local.current.state() }),
      }).catch(() => null);
      if (response?.status === 401) stop();
    };
    const reportSoon = () => {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        report();
      }, REPORT_AFTER_MS);
    };
    const take = async () => {
      if (isHeld(appView())) return;
      const response = await fetch("/api/devices/take", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: self.id }),
      }).catch(() => null);
      const answer = (await response?.json().catch(() => null)) as { commands?: DeviceCommand[] } | null;
      for (const command of answer?.commands ?? []) local.current.obey(command);
      if ((answer?.commands ?? []).length > 0) reportSoon();
    };
    const load = async () => {
      const response = await fetch("/api/devices").catch(() => null);
      if (!response?.ok) return response?.status === 401 ? "out" : "failed";
      const answer = (await response.json().catch(() => null)) as { now?: number; devices?: Device[] } | null;
      learnClock(answer?.now);
      setDevices(new Map((answer?.devices ?? []).filter((each) => each.id !== self.id).map((each) => [each.id, each])));
      return "ok";
    };
    const leave = () => {
      if (isHeld(appView())) return;
      navigator.sendBeacon?.(
        "/api/devices/leave",
        new Blob([JSON.stringify({ id: self.id })], { type: "application/json" }),
      );
    };
    const wake = () => {
      reportSoon();
      take();
    };
    const back = (event: PageTransitionEvent) => {
      if (event.persisted) report();
    };
    const stop = () => {
      stopped = true;
      source?.close();
      clearInterval(heartbeat);
      clearTimeout(timer);
      for (const name of MEDIA_EVENTS) document.removeEventListener(name, reportSoon, true);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", back);
      window.removeEventListener("soundscape-device-report", wake);
    };

    reportRef.current = reportSoon;
    load().then((result) => {
      if (stopped) return;
      if (result === "out") {
        stop();
        return;
      }
      setMe(self);
      report();
      source = new EventSource("/api/devices/live");
      source.addEventListener("open", () => {
        take();
        load();
      });
      source.addEventListener("device", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { now: number; device: Device };
        learnClock(data.now);
        keep(data.device);
      });
      source.addEventListener("gone", (event) => {
        const { id } = JSON.parse((event as MessageEvent).data) as { id: string };
        setDevices((before) => {
          const after = new Map(before);
          after.delete(id);
          return after;
        });
      });
      source.addEventListener("command", (event) => {
        const { to } = JSON.parse((event as MessageEvent).data) as { to: string };
        if (to === self.id) take();
      });
      heartbeat = setInterval(report, DEVICE_HEARTBEAT_MS);
      for (const name of MEDIA_EVENTS) document.addEventListener(name, reportSoon, true);
      window.addEventListener("pagehide", leave);
      window.addEventListener("pageshow", back);
      window.addEventListener("soundscape-device-report", wake);
    });
    return () => {
      stop();
      leave();
    };
  }, [local, username]);

  const now = useNow(15_000);

  const online = [...devices.values()].filter((device) => isOnline(device, now + offset));

  async function send(to: string, command: DeviceCommand) {
    const response = await fetch("/api/devices/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to, command }),
    }).catch(() => null);
    if (response?.ok) return null;
    if (response?.status === 404) {
      setDevices((before) => {
        const after = new Map(before);
        after.delete(to);
        return after;
      });
    }
    const answer = (await response?.json().catch(() => null)) as { error?: string } | null;
    return answer?.error ?? "Couldn't reach that device.";
  }

  return {
    me: me ? { id: me.id, name: me.name } : null,
    devices: online,
    offset,
    send,
    report: () => reportRef.current(),
  };
}

export function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function KindIcon({ kind }: { kind: DeviceKind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      {kind === "android" ? (
        <>
          <rect x="7" y="2.5" width="10" height="19" rx="2" />
          <path d="M11 18.5h2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <path d="M8 20h8M12 16v4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function useLater(send: (value: number) => void, waitMs = 250) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (value: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => send(value), waitMs);
  };
}

function RemoteDevice({
  device,
  serverNow,
  send,
  onPullHere,
  onSendHere,
  canSendHere,
  onFollow,
}: {
  device: Device;
  serverNow: number;
  send: (command: DeviceCommand) => void;
  onPullHere: () => void;
  onSendHere: () => void;
  canSendHere: boolean;
  onFollow: (() => void) | null;
}) {
  const [seeking, setSeeking] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const state = device.state;
  const time = seeking ?? timeNow(state, device.at, serverNow);
  const seekLater = useLater((value) => {
    send({ do: "seek", time: value });
    setTimeout(() => setSeeking(null), 1500);
  });
  const volumeLater = useLater((value) => {
    send({ do: "volume", volume: value });
    setTimeout(() => setVolume(null), 1500);
  });
  const shownVolume = volume ?? state.volume;

  return (
    <li className="device" data-device={device.id}>
      <div className="device-head">
        <KindIcon kind={device.kind} />
        <div className="device-name">
          <strong>{device.name}</strong>
          <span className="muted">{state.playing ? `Playing ${nowPlayingLine(device)}` : nowPlayingLine(device)}</span>
        </div>
      </div>
      {state.blocked && (
        <p className="muted device-blocked">
          This device isn't allowed to start sound on its own yet. Press play on it once, then you can control it from
          here.
        </p>
      )}
      {state.track && (
        <>
          <div className="device-controls">
            <button
              type="button"
              className="icon-button"
              aria-label={`Previous on ${device.name}`}
              onClick={() => send({ do: "previous" })}
            >
              <PreviousIcon size={18} />
            </button>
            <button
              type="button"
              className="icon-button device-toggle"
              aria-label={state.playing ? `Pause on ${device.name}` : `Play on ${device.name}`}
              onClick={() => send({ do: state.playing ? "pause" : "play" })}
            >
              {state.playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Next on ${device.name}`}
              onClick={() => send({ do: "next" })}
            >
              <NextIcon size={18} />
            </button>
            <svg
              className="device-speaker"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              fill="currentColor"
            >
              <path d="M4 9h4l5-4v14l-5-4H4z" />
              <path
                d="M16.5 9.5a3.5 3.5 0 0 1 0 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="range"
              className="device-volume"
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
          {state.duration && (
            <div className="device-seek">
              <span className="muted">{clock(time)}</span>
              <input
                type="range"
                min={0}
                max={state.duration}
                step="any"
                value={Math.min(time, state.duration)}
                aria-label={`Position on ${device.name}`}
                style={
                  {
                    "--fill": `${Math.round((Math.min(time, state.duration) / state.duration) * 100)}%`,
                  } as React.CSSProperties
                }
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setSeeking(value);
                  seekLater(value);
                }}
              />
              <span className="muted">{clock(state.duration)}</span>
            </div>
          )}
        </>
      )}
      <div className="device-moves">
        {state.track && (
          <button type="button" className="secondary" onClick={onPullHere}>
            Play here
          </button>
        )}
        {canSendHere && (
          <button type="button" className="secondary" onClick={onSendHere}>
            Play my music there
          </button>
        )}
        {onFollow && state.track && (
          <button type="button" className="secondary" onClick={onFollow}>
            Control in the player
          </button>
        )}
      </div>
    </li>
  );
}

export function DevicesPanel({
  link,
  party,
  hasQueue,
  alone,
  following,
  onClose,
  onMoveTo,
  onFollow,
}: {
  link: DeviceLink;
  party: PartyControls;
  hasQueue: boolean;
  alone: boolean;
  following: string | null;
  onClose: () => void;
  onMoveTo: (to: string) => Promise<string | null>;
  onFollow: (id: string) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const now = useNow(1000);

  async function run(work: Promise<string | null>) {
    setMessage(await work);
  }

  return (
    <section className={alone ? "queue-panel devices-panel alone" : "queue-panel devices-panel"} aria-label="Devices">
      <div className="section-head">
        <h2>Devices</h2>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <PartySection controls={party} />
      {link.me && (
        <p className="muted device-me">
          This device: <strong>{link.me.name}</strong>
        </p>
      )}
      {link.devices.length === 0 ? (
        <p className="muted">
          Open Soundscape on another device, like your computer, phone or another browser, while logged in as you. It
          shows up here, and you can control what it plays.
        </p>
      ) : (
        <ul className="device-list">
          {link.devices.map((device) => (
            <RemoteDevice
              key={device.id}
              device={device}
              serverNow={now + link.offset}
              send={(command) => run(link.send(device.id, command))}
              onPullHere={() => link.me && run(link.send(device.id, { do: "send", to: link.me.id }))}
              onSendHere={() => run(onMoveTo(device.id))}
              canSendHere={hasQueue}
              onFollow={device.id === following ? null : () => onFollow(device.id)}
            />
          ))}
        </ul>
      )}
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}

export function PlayingElsewhere({ device, onOpen }: { device: Device; onOpen: () => void }) {
  return (
    <button type="button" className="playing-elsewhere" onClick={onOpen}>
      <KindIcon kind={device.kind} />
      <span>
        Playing on <strong>{device.name}</strong>
        <span className="muted"> · {nowPlayingLine(device)}</span>
      </span>
    </button>
  );
}
