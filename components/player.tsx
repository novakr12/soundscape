"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { inOrder, nextPosition, nextRepeat, type Repeat, shuffleAfter, shuffleAll, unshuffle } from "@/lib/play-queue";
import { ArtistLink, SongLink } from "./music-links";
import VolumeControl from "./volume-control";

export type PlayerTrack = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
};

type PlayerContextValue = {
  current: PlayerTrack | null;
  queue: PlayerTrack[];
  position: number;
  play: (track: PlayerTrack) => void;
  playAll: (tracks: PlayerTrack[], start?: number) => void;
  next: () => void;
  previous: () => void;
  shuffle: boolean;
  repeat: Repeat;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
};

const SETTINGS_KEY = "soundscape:player";
const REPEAT_LABELS: Record<Repeat, string> = {
  off: "Repeat is off",
  all: "Repeating the queue",
  one: "Repeating this song",
};

const RESTART_AFTER_SECONDS = 3;
const SKIP_BROKEN_AFTER_MS = 1500;

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const player = useContext(PlayerContext);
  if (!player) throw new Error("usePlayer must be used inside PlayerProvider");
  return player;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
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
  const skip = useRef({ next: () => {}, previous: () => {}, ended: () => {} });
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const playing = useRef(0);
  const fellBack = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => audio.play().catch(() => {})],
      ["pause", () => audio.pause()],
      [
        "stop",
        () => {
          audio.pause();
          audio.currentTime = 0;
        },
      ],
      [
        "seekto",
        (details) => {
          if (details.seekTime !== undefined) audio.currentTime = details.seekTime;
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
    const playing = () => {
      session.playbackState = "playing";
    };
    const paused = () => {
      session.playbackState = "paused";
    };
    const ended = () => {
      paused();
      skip.current.ended();
    };
    audio.addEventListener("play", playing);
    audio.addEventListener("pause", paused);
    audio.addEventListener("ended", ended);
    return () => {
      audio.removeEventListener("play", playing);
      audio.removeEventListener("pause", paused);
      audio.removeEventListener("ended", ended);
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {}
      }
    };
  }, []);

  function describe(track: PlayerTrack, isFull: boolean) {
    setFull(isFull);
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: isFull ? "Full song from Navidrome" : "30-second preview",
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
    arrange(tracksRef.current, orderRef.current, index);
    start(tracksRef.current[orderRef.current[index]]);
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
        : [chosen, ...shuffleAll(list.length).filter((index) => index !== chosen)]
      : inOrder(list.length);
    const index = shuffleRef.current ? 0 : chosen;
    arrange(list, listOrder, index);
    start(list[listOrder[index]]);
  }

  function next() {
    const index = nextPosition(
      positionRef.current,
      orderRef.current.length,
      repeatRef.current === "all" ? "all" : "off",
    );
    if (index !== null) moveTo(index);
  }

  function ended() {
    const audio = audioRef.current;
    if (repeatRef.current === "one" && audio) {
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

  function cycleRepeat() {
    repeatRef.current = nextRepeat(repeatRef.current);
    setRepeat(repeatRef.current);
    remember();
  }

  skip.current = { next, previous, ended };
  const hasNext = position + 1 < queue.length || (repeat === "all" && queue.length > 1);

  function start(track: PlayerTrack) {
    const audio = audioRef.current;
    if (!audio) return;
    const id = ++playing.current;
    fellBack.current = false;
    setError(null);
    describe(track, false);
    const path = `/api/listen/${encodeURIComponent(track.trackId)}`;
    audio.src = path;
    audio.play().catch(() => {});
    fetch(`${path}?info`)
      .then((response) => (response.ok ? response.json() : { full: false }))
      .then((info: { full?: boolean }) => {
        if (id === playing.current && !fellBack.current) describe(track, info.full === true);
      })
      .catch(() => {});
  }

  function failed() {
    const audio = audioRef.current;
    if (!current || !audio) return;
    if (!fellBack.current) {
      fellBack.current = true;
      describe(current, false);
      audio.src = `/api/preview/${encodeURIComponent(current.trackId)}`;
      audio.play().catch(() => {});
      return;
    }
    setError("Can't play this song right now");
    const id = playing.current;
    setTimeout(() => {
      if (id === playing.current) next();
    }, SKIP_BROKEN_AFTER_MS);
  }

  return (
    <PlayerContext.Provider
      value={{ current, queue, position, play, playAll, next, previous, shuffle, repeat, toggleShuffle, cycleRepeat }}
    >
      {children}
      <div className="player" hidden={!current}>
        {current?.cover && <img src={current.cover} alt="" width={48} height={48} />}
        <div className="now-playing">
          {current && (
            <>
              <strong>
                <SongLink trackId={current.trackId}>{current.title}</SongLink>
              </strong>
              <span className="muted">
                <ArtistLink name={current.artist} /> · {full ? "full song from Navidrome" : "30-second preview"}
                {queue.length > 1 && ` · ${position + 1} of ${queue.length}`}
              </span>
            </>
          )}
          {error && <span className="error">{error}</span>}
        </div>
        <div className="player-skip">
          <button
            type="button"
            data-player="shuffle"
            aria-label="Shuffle"
            aria-pressed={shuffle}
            title={shuffle ? "Shuffle is on" : "Shuffle is off"}
            onClick={toggleShuffle}
          >
            🔀
          </button>
          <button type="button" data-player="previous" aria-label="Previous song" onClick={previous}>
            ⏮
          </button>
          <button type="button" data-player="next" aria-label="Next song" onClick={next} disabled={!hasNext}>
            ⏭
          </button>
          <button
            type="button"
            data-player="repeat"
            data-repeat={repeat}
            aria-label={REPEAT_LABELS[repeat]}
            aria-pressed={repeat !== "off"}
            title={REPEAT_LABELS[repeat]}
            onClick={cycleRepeat}
          >
            {repeat === "one" ? "🔂" : "🔁"}
          </button>
        </div>
        <audio ref={audioRef} controls onError={failed} />
        <VolumeControl audio={audioRef} />
      </div>
    </PlayerContext.Provider>
  );
}
