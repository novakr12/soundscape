"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type Gain, gainLevel, playingAnAlbum } from "@/lib/levelling";
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
  shuffleAfter,
  shuffleAll,
  songLength,
  startingWith,
  unshuffle,
} from "@/lib/play-queue";
import { DEFAULT_OPTIONS, type PlayerOptions, watchOptions } from "@/lib/player-options";
import type { RadioSeed } from "@/lib/radio";
import LyricsPanel from "./lyrics-panel";
import { PlayerBar, QueuePanel } from "./player-bar";
import { usePlayerKeys } from "./player-keys";
import type { Sleep } from "./sleep-timer";

export type PlayerTrack = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  songId?: string;
  newSong?: boolean;
  album?: string;
  albumHref?: string;
  gain?: Gain;
  duration?: number;
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
  startRadio: (seed: RadioSeed) => Promise<string | null>;
  radio: boolean;
};

const SETTINGS_KEY = "soundscape:player";
const RADIO_REFILL_AT = 3;
const FADE_OUT_MS = 10_000;
const FADE_STEPS = 40;
const FADE_TICK_MS = 100;
const QUEUE_KEY = "soundscape:queue";
const RESUME_KEY = "soundscape:resume";
const SAVE_TIME_EVERY_MS = 5000;

const RESTART_AFTER_SECONDS = 3;
const SKIP_BROKEN_AFTER_MS = 1500;
const GIVE_UP_LOADING_AFTER_MS = 12_000;
const PREPARE_NEXT_SECONDS = 30;
const WATCH_END_SECONDS = 1.5;
const START_NEXT_EARLY_MS = 13;
const ANNOUNCE_AGAIN_AFTER_MS = 60_000;
const CLOSE_TO_END_SECONDS = 0.25;

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
  const early = useRef<number | null>(null);
  const announced = useRef({ id: 0, at: 0 });
  const [active, setActive] = useState<HTMLAudioElement | null>(null);
  const activeAudio = useMemo(() => ({ current: active }), [active]);
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [position, setPosition] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>("off");
  const queue = order.map((index) => tracks[index]);
  const current = queue[position] ?? null;
  const [options, setOptions] = useState<PlayerOptions>(DEFAULT_OPTIONS);
  const [radio, setRadio] = useState<RadioSeed | null>(null);
  const radioLoading = useRef(false);
  const [sleep, setSleep] = useState<Sleep>(null);
  const [fadeIn, setFadeIn] = useState(1);
  const fading = useRef(false);
  const optionsRef = useRef<PlayerOptions>(DEFAULT_OPTIONS);
  const sleepRef = useRef<Sleep>(null);
  const level = options.levelling ? gainLevel(current?.gain, playingAnAlbum(queue, position)) : 1;
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
    finish: (_id: number) => {},
    announce: () => {},
    refill: (_seed: RadioSeed) => {},
    sleep: () => {},
  });
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const playing = useRef(0);
  const fellBack = useRef(false);
  const autoplay = useRef(false);
  const listen = useRef({ full: false, heard: 0, last: null as number | null, counted: false });
  const pendingTime = useRef(0);
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

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
      skip.current.announce();
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

  function announce() {
    const audio = audioRef.current;
    const track = tracksRef.current[orderRef.current[positionRef.current]];
    if (!audio || audio.paused || !track || !listen.current.full) return;
    const id = playing.current;
    const now = Date.now();
    if (announced.current.id === id && now - announced.current.at < ANNOUNCE_AGAIN_AFTER_MS) return;
    announced.current = { id, at: now };
    fetch("/api/now-playing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        track.songId ? { trackId: track.trackId, songId: track.songId } : { trackId: track.trackId },
      ),
    }).catch(() => {});
  }

  function describe(track: PlayerTrack, isFull: boolean) {
    setFull(isFull);
    listen.current.full = isFull;
    if (isFull) announce();
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

  usePlayerKeys(audioRef, tracksRef, skip);

  useEffect(
    () =>
      watchOptions((next) => {
        optionsRef.current = next;
        setOptions(next);
      }),
    [],
  );

  useEffect(() => {
    if (sleep?.kind !== "time") return;
    const timer = setTimeout(() => skip.current.sleep(), Math.max(0, sleep.until - Date.now()));
    return () => clearTimeout(timer);
  }, [sleep]);

  useEffect(() => {
    skip.current.restore();
  }, []);

  function restoreSaved() {
    if (playing.current > 0) return;
    try {
      const saved = restoreQueue(JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "null"));
      if (!saved) return;
      const resume = sessionStorage.getItem(RESUME_KEY) === "1";
      sessionStorage.removeItem(RESUME_KEY);
      arrange(saved.tracks, saved.order, saved.position);
      start(saved.tracks[saved.order[saved.position]], resume, saved.time);
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
    const leave = () => {
      save();
      try {
        if (audioRef.current && !audioRef.current.paused) sessionStorage.setItem(RESUME_KEY, "1");
        else sessionStorage.removeItem(RESUME_KEY);
      } catch {}
    };
    save();
    const timer = setInterval(save, SAVE_TIME_EVERY_MS);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
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

  function lengthOf(audio: HTMLAudioElement | null | undefined) {
    const track = tracksRef.current[orderRef.current[positionRef.current]];
    return songLength(audio?.duration ?? Number.NaN, track?.duration);
  }

  function prepareNext() {
    const audio = audioRef.current;
    const standby = standbyRef.current;
    const length = lengthOf(audio);
    if (!audio || !standby || fading.current || repeatRef.current === "one" || !Number.isFinite(length)) return;
    if (length - audio.currentTime > PREPARE_NEXT_SECONDS) return;
    const index = nextPosition(positionRef.current, orderRef.current.length, repeatRef.current);
    if (index === null || index === positionRef.current) return;
    const key = preparedKey(index);
    if (!key || key === prepared.current) return;
    prepared.current = key;
    standby.src = sourceFor(tracksRef.current[orderRef.current[index]]);
    standby.load();
  }

  function handOver(index: number, fadeSeconds = 0) {
    const old = audioRef.current;
    const standby = standbyRef.current;
    const key = preparedKey(index);
    if (!old || !standby || !key || key !== prepared.current) return false;
    if (standby.error || standby.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
    const track = tracksRef.current[orderRef.current[index]];
    prepared.current = null;
    standby.volume = fadeSeconds > 0 ? 0 : old.volume;
    standby.muted = old.muted;
    standby.currentTime = 0;
    audioRef.current = standby;
    standbyRef.current = old;
    if (fadeSeconds > 0) old.before(standby);
    else old.replaceWith(standby);
    standby.play().catch(() => {});
    if (fadeSeconds > 0) crossfade(old, fadeSeconds);
    else unload(old);
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

  function unload(audio: HTMLAudioElement) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  function crossfade(old: HTMLAudioElement, seconds: number) {
    const from = old.volume;
    const began = performance.now();
    fading.current = true;
    setFadeIn(0);
    const timer = setInterval(() => {
      const done = Math.min(1, (performance.now() - began) / (seconds * 1000));
      if (old === standbyRef.current) old.volume = from * (1 - done);
      setFadeIn(done);
      if (done < 1) return;
      clearInterval(timer);
      fading.current = false;
      old.remove();
      if (old === standbyRef.current) unload(old);
    }, FADE_TICK_MS);
  }

  function crossfadeSeconds(index: number) {
    const seconds = optionsRef.current.crossfade;
    if (seconds <= 0 || repeatRef.current === "one") return 0;
    const here = tracksRef.current[orderRef.current[positionRef.current]];
    const next = tracksRef.current[orderRef.current[index]];
    return here && next && playingAnAlbum([here, next], 0) ? 0 : seconds;
  }

  function startCrossfade() {
    const audio = audioRef.current;
    if (!audio || audio.paused || fading.current || !prepared.current) return;
    if (sleepRef.current?.kind === "song" || !Number.isFinite(lengthOf(audio))) return;
    const index = nextPosition(positionRef.current, orderRef.current.length, repeatRef.current);
    if (index === null || index === positionRef.current) return;
    const seconds = crossfadeSeconds(index);
    if (seconds <= 0 || lengthOf(audio) < seconds * 3) return;
    if ((lengthOf(audio) - audio.currentTime) / audio.playbackRate > seconds) return;
    handOver(index, seconds);
  }

  function play(track: PlayerTrack) {
    setRadio(null);
    arrange([track], [0], 0);
    start(track);
  }

  function playAll(list: PlayerTrack[], first = 0) {
    if (list.length === 0) return;
    setRadio(null);
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
    setRadio(null);
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

  function finishEarly(id: number) {
    const audio = audioRef.current;
    if (id !== playing.current || !audio || audio.paused) {
      early.current = null;
      return;
    }
    if ((lengthOf(audio) - audio.currentTime) / audio.playbackRate > CLOSE_TO_END_SECONDS) {
      early.current = null;
      return;
    }
    const index = nextPosition(positionRef.current, orderRef.current.length, repeatRef.current);
    if (index !== null) handOver(index);
  }

  function startNextOnTime() {
    const audio = audioRef.current;
    if (!audio || audio.paused || !prepared.current || repeatRef.current === "one") return;
    if (sleepRef.current?.kind === "song") return;
    if (!Number.isFinite(lengthOf(audio)) || audio.playbackRate <= 0) return;
    const left = (lengthOf(audio) - audio.currentTime) / audio.playbackRate;
    const id = playing.current;
    if (left > WATCH_END_SECONDS || early.current === id) return;
    early.current = id;
    setTimeout(() => skip.current.finish(id), Math.max(0, left * 1000 - START_NEXT_EARLY_MS));
  }

  function listened() {
    const audio = audioRef.current;
    if (!audio) return;
    prepareNext();
    startCrossfade();
    startNextOnTime();
    const now = audio.currentTime;
    const state = listen.current;
    if (!audio.paused) state.heard += heardStep(state.last, now);
    state.last = audio.paused ? null : now;
    if (state.counted || !state.full || !countsAsPlay(state.heard, lengthOf(audio))) return;
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
    if (sleepRef.current?.kind === "song") {
      chooseSleep(null);
      const index =
        nextPosition(positionRef.current, orderRef.current.length, repeatRef.current) ?? positionRef.current;
      arrange(tracksRef.current, orderRef.current, index);
      start(tracksRef.current[orderRef.current[index]], false);
      return;
    }
    if (repeatRef.current === "one" && audio) {
      listenAfresh();
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    const index = nextPosition(positionRef.current, orderRef.current.length, repeatRef.current);
    if (index !== null) moveTo(index);
  }

  function chooseSleep(next: Sleep) {
    sleepRef.current = next;
    setSleep(next);
  }

  function fallAsleep() {
    const audio = audioRef.current;
    chooseSleep(null);
    if (!audio || audio.paused) return;
    const from = audio.volume;
    let step = 0;
    const fade = setInterval(() => {
      step++;
      if (audio !== audioRef.current || audio.paused || step >= FADE_STEPS) {
        clearInterval(fade);
        audio.pause();
        audio.volume = from;
        return;
      }
      audio.volume = from * (1 - step / FADE_STEPS);
    }, FADE_OUT_MS / FADE_STEPS);
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

  async function radioBatch(seed: RadioSeed, exclude: string[]) {
    const response = await fetch("/api/radio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...seed, exclude }),
    });
    const answer = (await response.json().catch(() => null)) as { songs?: PlayerTrack[]; error?: string } | null;
    if (!response.ok) throw new Error(answer?.error ?? "The radio couldn't start");
    return answer?.songs ?? [];
  }

  async function startRadio(seed: RadioSeed) {
    try {
      const songs = await radioBatch(seed, []);
      if (songs.length === 0) return "None of these songs are in your Navidrome yet.";
      shuffleRef.current = false;
      setShuffle(false);
      remember();
      playAll(songs);
      setRadio(seed);
      return null;
    } catch (problem) {
      return problem instanceof Error ? problem.message : "The radio couldn't start";
    }
  }

  function refill(seed: RadioSeed) {
    radioLoading.current = true;
    const exclude = tracksRef.current.flatMap((track) => (track.songId ? [track.songId] : []));
    radioBatch(seed, exclude)
      .then((songs) => {
        if (songs.length === 0) return setRadio(null);
        const from = tracksRef.current.length;
        arrange(
          [...tracksRef.current, ...songs],
          [...orderRef.current, ...songs.map((_, i) => from + i)],
          positionRef.current,
        );
      })
      .catch(() => {})
      .finally(() => {
        radioLoading.current = false;
      });
  }

  useEffect(() => {
    if (!radio || radioLoading.current || order.length - position > RADIO_REFILL_AT) return;
    skip.current.refill(radio);
  }, [radio, position, order.length]);

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
    finish: finishEarly,
    announce,
    refill,
    sleep: fallAsleep,
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
          audio.currentTime = Number.isFinite(lengthOf(audio)) ? Math.min(at, Math.max(lengthOf(audio) - 1, 0)) : at;
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
        startRadio,
        radio: radio !== null,
      }}
    >
      {children}
      {current && showLyrics && <LyricsPanel track={current} audio={audioRef} onClose={() => setShowLyrics(false)} />}
      {current && showQueue && (
        <QueuePanel
          queue={queue}
          keys={order}
          position={position}
          onClose={() => setShowQueue(false)}
          onJump={jumpTo}
          onRemove={remove}
        />
      )}
      <PlayerBar
        current={current}
        position={position}
        length={queue.length}
        full={full}
        error={error}
        shuffle={shuffle}
        repeat={repeat}
        hasNext={hasNext}
        showQueue={showQueue}
        audio={activeAudio}
        level={(full ? level : 1) * fadeIn}
        sleep={sleep}
        onSleep={chooseSleep}
        live={audioRef}
        holder={holderRef}
        onShuffle={toggleShuffle}
        onPrevious={previous}
        onNext={next}
        onRepeat={cycleRepeat}
        onQueue={() => {
          setShowLyrics(false);
          setShowQueue(!showQueue);
        }}
        showLyrics={showLyrics}
        onLyrics={() => {
          setShowQueue(false);
          setShowLyrics(!showLyrics);
        }}
      />
    </PlayerContext.Provider>
  );
}
