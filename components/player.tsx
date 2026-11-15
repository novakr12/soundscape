"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  countsAsPlay,
  heardStep,
  inOrder,
  insertAfter,
  LONGEST_QUEUE,
  nextPosition,
  nextRepeat,
  queueWindow,
  type Repeat,
  removeAt,
  restoreQueue,
  SEEK_STEP_SECONDS,
  seekTarget,
  shortcutFor,
  shuffleAfter,
  shuffleAll,
  startingWith,
  unshuffle,
} from "@/lib/play-queue";
import { ArtistLink, SongLink } from "./music-links";
import { NextIcon, PreviousIcon, QueueIcon, RepeatIcon, ShuffleIcon } from "./player-icons";
import { PlayPauseButton, SeekBar } from "./player-transport";
import VolumeControl from "./volume-control";

export type PlayerTrack = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  songId?: string;
  newSong?: boolean;
  album?: string;
  albumHref?: string;
};

type PlayerContextValue = {
  current: PlayerTrack | null;
  queue: PlayerTrack[];
  position: number;
  play: (track: PlayerTrack) => void;
  playAll: (tracks: PlayerTrack[], start?: number) => void;
  playFrom: (tracks: PlayerTrack[], chosen: number) => void;
  next: () => void;
  previous: () => void;
  shuffle: boolean;
  repeat: Repeat;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playNext: (track: PlayerTrack) => void;
  addToQueue: (track: PlayerTrack) => void;
  remove: (position: number) => void;
  jumpTo: (position: number) => void;
};

const SETTINGS_KEY = "soundscape:player";
const QUEUE_KEY = "soundscape:queue";
const SAVE_TIME_EVERY_MS = 5000;
const REPEAT_LABELS: Record<Repeat, string> = {
  off: "Repeat is off",
  all: "Repeating the queue",
  one: "Repeating this song",
};

const RESTART_AFTER_SECONDS = 3;
const SKIP_BROKEN_AFTER_MS = 1500;
const GIVE_UP_LOADING_AFTER_MS = 12_000;
const PREPARE_NEXT_SECONDS = 30;
const KEEPS_ITS_KEYS =
  "input, textarea, select, button, audio, video, summary, [contenteditable]:not([contenteditable='false']), [role='slider'], [role='textbox'], [role='menuitem']";

function keepsItsKeys(target: EventTarget | null) {
  return target instanceof Element && target.closest(KEEPS_ITS_KEYS) !== null;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const player = useContext(PlayerContext);
  if (!player) throw new Error("usePlayer must be used inside PlayerProvider");
  return player;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const standbyRef = useRef<HTMLAudioElement | null>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const prepared = useRef<string | null>(null);
  const [active, setActive] = useState<HTMLAudioElement | null>(null);
  const activeAudio = useMemo(() => ({ current: active }), [active]);
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [position, setPosition] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>("off");
  const queue = order.map((index) => tracks[index]);
  const current = queue[position] ?? null;
  const tracksRef = useRef<PlayerTrack[]>([]);
  const orderRef = useRef<number[]>([]);
  const positionRef = useRef(0);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<Repeat>("off");
  const skip = useRef({
    next: () => {},
    previous: () => {},
    ended: () => {},
    restore: () => {},
    listened: () => {},
    failed: () => {},
    prepare: () => {},
  });
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const playing = useRef(0);
  const fellBack = useRef(false);
  const autoplay = useRef(false);
  const listen = useRef({ full: false, heard: 0, last: null as number | null, counted: false });
  const pendingTime = useRef(0);
  const [showQueue, setShowQueue] = useState(false);

  function bind(element: HTMLAudioElement) {
    const mine = () => element === audioRef.current;
    const session = "mediaSession" in navigator ? navigator.mediaSession : null;
    element.addEventListener("timeupdate", () => {
      if (mine()) skip.current.listened();
    });
    element.addEventListener("seeking", () => {
      if (mine()) listen.current.last = null;
    });
    element.addEventListener("play", () => {
      if (!mine()) return;
      autoplay.current = true;
      if (session) session.playbackState = "playing";
    });
    element.addEventListener("pause", () => {
      if (mine() && session) session.playbackState = "paused";
    });
    element.addEventListener("ended", () => {
      if (!mine()) return;
      if (session) session.playbackState = "paused";
      skip.current.ended();
    });
    element.addEventListener("error", () => {
      if (mine()) skip.current.failed();
      else prepared.current = null;
    });
  }

  function audioElement() {
    if (audioRef.current) return audioRef.current;
    const holder = holderRef.current;
    if (!holder) return null;
    const first = document.createElement("audio");
    const second = document.createElement("audio");
    second.preload = "auto";
    bind(first);
    bind(second);
    holder.appendChild(first);
    audioRef.current = first;
    standbyRef.current = second;
    setActive(first);
    return first;
  }

  useEffect(() => {
    skip.current.prepare();
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => audioRef.current?.play().catch(() => {})],
      ["pause", () => audioRef.current?.pause()],
      [
        "stop",
        () => {
          const audio = audioRef.current;
          if (!audio) return;
          audio.pause();
          audio.currentTime = 0;
        },
      ],
      [
        "seekto",
        (details) => {
          const audio = audioRef.current;
          if (audio && details.seekTime !== undefined) audio.currentTime = details.seekTime;
        },
      ],
      ["nexttrack", () => skip.current.next()],
      ["previoustrack", () => skip.current.previous()],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {}
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {}
      }
    };
  }, []);

  function describe(track: PlayerTrack, isFull: boolean) {
    setFull(isFull);
    listen.current.full = isFull;
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: isFull ? (track.album ?? "Soundscape") : "30-second preview",
      artwork: track.cover ? [{ src: track.cover }] : [],
    });
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as { shuffle?: unknown; repeat?: unknown };
      if (saved.shuffle === true) {
        shuffleRef.current = true;
        setShuffle(true);
      }
      if (saved.repeat === "all" || saved.repeat === "one") {
        repeatRef.current = saved.repeat;
        setRepeat(saved.repeat);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      if (event.defaultPrevented || keepsItsKeys(event.target)) return;
      const audio = audioRef.current;
      if (!audio?.currentSrc || tracksRef.current.length === 0) return;
      const shortcut = shortcutFor(event.key, {
        shift: event.shiftKey,
        other: event.ctrlKey || event.metaKey || event.altKey,
        repeat: event.repeat,
      });
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "toggle") {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      } else if (shortcut === "back" || shortcut === "forward") {
        const step = shortcut === "back" ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS;
        audio.currentTime = seekTarget(audio.currentTime, step, audio.duration);
      } else if (shortcut === "next") {
        skip.current.next();
      } else {
        skip.current.previous();
      }
    };
    window.addEventListener("keydown", pressed);
    return () => window.removeEventListener("keydown", pressed);
  }, []);

  useEffect(() => {
    skip.current.restore();
  }, []);

  function restoreSaved() {
    if (playing.current > 0) return;
    try {
      const saved = restoreQueue(JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "null"));
      if (!saved) return;
      arrange(saved.tracks, saved.order, saved.position);
      start(saved.tracks[saved.order[saved.position]], false, saved.time);
    } catch {}
  }

  useEffect(() => {
    if (order.length === 0) return;
    const save = () => {
      try {
        const audio = audioRef.current;
        const time = pendingTime.current || audio?.currentTime || 0;
        const keep = tracks.slice(0, LONGEST_QUEUE);
        const kept = order.filter((index) => index < keep.length);
        localStorage.setItem(
          QUEUE_KEY,
          JSON.stringify({ tracks: keep, order: kept, position: Math.min(position, kept.length - 1), time }),
        );
      } catch {}
    };
    save();
    const timer = setInterval(save, SAVE_TIME_EVERY_MS);
    window.addEventListener("pagehide", save);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", save);
    };
  }, [tracks, order, position]);

  function remember() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ shuffle: shuffleRef.current, repeat: repeatRef.current }));
    } catch {}
  }

  function arrange(nextTracks: PlayerTrack[], nextOrder: number[], index: number) {
    tracksRef.current = nextTracks;
    orderRef.current = nextOrder;
    positionRef.current = index;
    setTracks(nextTracks);
    setOrder(nextOrder);
    setPosition(index);
  }

  function moveTo(index: number) {
    if (handOver(index)) return;
    arrange(tracksRef.current, orderRef.current, index);
    start(tracksRef.current[orderRef.current[index]]);
  }

  function sourceFor(track: PlayerTrack) {
    return track.songId
      ? `/api/full-song/${encodeURIComponent(track.songId)}`
      : `/api/listen/${encodeURIComponent(track.trackId)}`;
  }

  function preparedKey(index: number) {
    const track = tracksRef.current[orderRef.current[index]];
    return track ? `${index}|${track.trackId}|${track.songId ?? ""}|${sourceFor(track)}` : null;
  }

  function prepareNext() {
    const audio = audioRef.current;
    const standby = standbyRef.current;
    if (!audio || !standby || repeatRef.current === "one" || !Number.isFinite(audio.duration)) return;
    if (audio.duration - audio.currentTime > PREPARE_NEXT_SECONDS) return;
    const index = nextPosition(positionRef.current, orderRef.current.length, repeatRef.current);
    if (index === null || index === positionRef.current) return;
    const key = preparedKey(index);
    if (!key || key === prepared.current) return;
    prepared.current = key;
    standby.src = sourceFor(tracksRef.current[orderRef.current[index]]);
    standby.load();
  }

  function handOver(index: number) {
    const old = audioRef.current;
    const standby = standbyRef.current;
    const key = preparedKey(index);
    if (!old || !standby || !key || key !== prepared.current) return false;
    if (standby.error || standby.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
    const track = tracksRef.current[orderRef.current[index]];
    prepared.current = null;
    standby.volume = old.volume;
    standby.muted = old.muted;
    standby.currentTime = 0;
    audioRef.current = standby;
    standbyRef.current = old;
    old.replaceWith(standby);
    standby.play().catch(() => {});
    old.pause();
    old.removeAttribute("src");
    old.load();
    setActive(standby);
    arrange(tracksRef.current, orderRef.current, index);
    const id = ++playing.current;
    fellBack.current = false;
    autoplay.current = true;
    pendingTime.current = 0;
    listen.current = { full: false, heard: 0, last: null, counted: false };
    setError(null);
    describe(track, Boolean(track.songId));
    learn(track, id);
    return true;
  }

  function play(track: PlayerTrack) {
    arrange([track], [0], 0);
    start(track);
  }

  function playAll(list: PlayerTrack[], first = 0) {
    if (list.length === 0) return;
    const chosen = Math.min(Math.max(first, 0), list.length - 1);
    const listOrder = shuffleRef.current
      ? first === 0
        ? shuffleAll(list.length)
        : startingWith(chosen, shuffleAll(list.length))
      : inOrder(list.length);
    const index = shuffleRef.current ? 0 : chosen;
    arrange(list, listOrder, index);
    start(list[listOrder[index]]);
  }

  function playFrom(list: PlayerTrack[], chosen: number) {
    if (list.length === 0) return;
    const at = Math.min(Math.max(chosen, 0), list.length - 1);
    const { from, to } = queueWindow(list.length, at);
    const part = list.slice(from, to);
    const index = at - from;
    const listOrder = shuffleRef.current ? startingWith(index, shuffleAll(part.length)) : inOrder(part.length);
    const position = shuffleRef.current ? 0 : index;
    arrange(part, listOrder, position);
    start(part[listOrder[position]]);
  }

  function next() {
    const index = nextPosition(
      positionRef.current,
      orderRef.current.length,
      repeatRef.current === "all" ? "all" : "off",
    );
    if (index !== null) moveTo(index);
  }

  function listenAfresh() {
    listen.current = { full: listen.current.full, heard: 0, last: null, counted: false };
  }

  function listened() {
    const audio = audioRef.current;
    if (!audio) return;
    prepareNext();
    const now = audio.currentTime;
    const state = listen.current;
    if (!audio.paused) state.heard += heardStep(state.last, now);
    state.last = audio.paused ? null : now;
    if (state.counted || !state.full || !countsAsPlay(state.heard, audio.duration)) return;
    const track = tracksRef.current[orderRef.current[positionRef.current]];
    if (!track) return;
    state.counted = true;
    fetch("/api/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        track.songId ? { trackId: track.trackId, songId: track.songId } : { trackId: track.trackId },
      ),
    }).catch(() => {});
  }

  function ended() {
    const audio = audioRef.current;
    if (repeatRef.current === "one" && audio) {
      listenAfresh();
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    const index = nextPosition(positionRef.current, orderRef.current.length, repeatRef.current);
    if (index !== null) moveTo(index);
  }

  function previous() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime > RESTART_AFTER_SECONDS || positionRef.current === 0) {
      listenAfresh();
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    moveTo(positionRef.current - 1);
  }

  function toggleShuffle() {
    shuffleRef.current = !shuffleRef.current;
    setShuffle(shuffleRef.current);
    remember();
    if (orderRef.current.length < 2) return;
    if (shuffleRef.current) {
      arrange(tracksRef.current, shuffleAfter(orderRef.current, positionRef.current), positionRef.current);
    } else {
      const restored = unshuffle(orderRef.current, positionRef.current);
      arrange(tracksRef.current, restored.order, restored.position);
    }
  }

  function enqueue(track: PlayerTrack, next: boolean) {
    if (orderRef.current.length === 0) {
      play(track);
      return;
    }
    const index = tracksRef.current.length;
    const nextTracks = [...tracksRef.current, track];
    const nextOrder = next ? insertAfter(orderRef.current, positionRef.current, index) : [...orderRef.current, index];
    arrange(nextTracks, nextOrder, positionRef.current);
  }

  function playNext(track: PlayerTrack) {
    enqueue(track, true);
  }

  function addToQueue(track: PlayerTrack) {
    enqueue(track, false);
  }

  function remove(at: number) {
    const left = removeAt(orderRef.current, positionRef.current, at);
    arrange(tracksRef.current, left.order, left.position);
  }

  function jumpTo(at: number) {
    if (at >= 0 && at < orderRef.current.length) moveTo(at);
  }

  function cycleRepeat() {
    repeatRef.current = nextRepeat(repeatRef.current);
    setRepeat(repeatRef.current);
    remember();
  }

  skip.current = {
    next,
    previous,
    ended,
    restore: restoreSaved,
    listened,
    failed,
    prepare: () => audioElement(),
  };
  const hasNext = position + 1 < queue.length || (repeat === "all" && queue.length > 1);

  function start(track: PlayerTrack, play = true, at = 0) {
    const audio = audioElement();
    if (!audio) return;
    const id = ++playing.current;
    fellBack.current = false;
    autoplay.current = play;
    listen.current = { full: false, heard: 0, last: null, counted: false };
    setError(null);
    describe(track, Boolean(track.songId));
    audio.src = sourceFor(track);
    pendingTime.current = at;
    if (at > 0) {
      audio.addEventListener(
        "loadedmetadata",
        () => {
          if (id !== playing.current) return;
          audio.currentTime = Math.min(at, Math.max(audio.duration - 1, 0));
          pendingTime.current = 0;
        },
        { once: true },
      );
    }
    if (play) {
      audio.play().catch(() => {});
      watchLoading(id);
    }
    learn(track, id);
  }

  function learn(track: PlayerTrack, id: number) {
    if (track.songId) return;
    fetch(`${sourceFor(track)}?info`)
      .then((response) => (response.ok ? response.json() : { full: false }))
      .then((info: { full?: boolean }) => {
        if (id === playing.current && !fellBack.current) describe(track, info.full === true);
      })
      .catch(() => {});
  }

  function watchLoading(id: number) {
    setTimeout(() => {
      const audio = audioRef.current;
      if (!audio || id !== playing.current || audio.paused) return;
      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
      const before = fellBack.current;
      skip.current.failed();
      if (!before && fellBack.current && id === playing.current) watchLoading(id);
    }, GIVE_UP_LOADING_AFTER_MS);
  }

  function failed() {
    const audio = audioRef.current;
    if (!current || !audio) return;
    if (!fellBack.current) {
      fellBack.current = true;
      describe(current, false);
      audio.src = `/api/preview/${encodeURIComponent(current.trackId)}`;
      if (autoplay.current) audio.play().catch(() => {});
      return;
    }
    setError("Can't play this song right now");
    if (!autoplay.current) return;
    const id = playing.current;
    setTimeout(() => {
      if (id === playing.current) next();
    }, SKIP_BROKEN_AFTER_MS);
  }

  return (
    <PlayerContext.Provider
      value={{
        current,
        queue,
        position,
        play,
        playAll,
        playFrom,
        next,
        previous,
        shuffle,
        repeat,
        toggleShuffle,
        cycleRepeat,
        playNext,
        addToQueue,
        remove,
        jumpTo,
      }}
    >
      {children}
      {current && showQueue && (
        <section className="queue-panel" aria-label="Queue">
          <div className="section-head">
            <h2>Queue</h2>
            <button type="button" className="secondary" onClick={() => setShowQueue(false)}>
              Close
            </button>
          </div>
          <ol>
            {queue.map((track, at) => (
              <li key={`${order[at]}`} className={at === position ? "current" : at < position ? "played" : undefined}>
                <button type="button" className="queue-song" onClick={() => jumpTo(at)}>
                  <span>{track.title}</span> <span className="muted">· {track.artist}</span>
                </button>
                {at !== position && (
                  <button
                    type="button"
                    className="queue-remove"
                    aria-label={`Remove ${track.title} from the queue`}
                    onClick={() => remove(at)}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="player" hidden={!current}>
        <div className="player-song">
          {current?.cover && <img src={current.cover} alt="" width={48} height={48} />}
          <div className="now-playing">
            {current && (
              <>
                <strong title={current.title}>
                  {current.newSong ? current.title : <SongLink trackId={current.trackId}>{current.title}</SongLink>}
                </strong>
                <span className="muted" title={[current.artist, current.album].filter(Boolean).join(" · ")}>
                  {current.newSong ? current.artist : <ArtistLink name={current.artist} />}
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
                  {queue.length > 1 && ` · ${position + 1} of ${queue.length}`}
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
              onClick={toggleShuffle}
            >
              <ShuffleIcon size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              data-player="previous"
              aria-label="Previous song"
              title="Previous song (Shift+←)"
              onClick={previous}
            >
              <PreviousIcon />
            </button>
            <PlayPauseButton audio={activeAudio} />
            <button
              type="button"
              className="icon-button"
              data-player="next"
              aria-label="Next song"
              title="Next song (Shift+→)"
              onClick={next}
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
              onClick={cycleRepeat}
            >
              <RepeatIcon size={18} one={repeat === "one"} />
            </button>
          </div>
          <SeekBar audio={activeAudio} />
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
            onClick={() => setShowQueue(!showQueue)}
          >
            <QueueIcon size={18} />
          </button>
          <VolumeControl audio={activeAudio} />
        </div>
        <div className="player-audio" ref={holderRef} />
      </div>
    </PlayerContext.Provider>
  );
}
