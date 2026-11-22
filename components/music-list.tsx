"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { downloadTracks } from "@/lib/app-downloads";
import type { MusicSong } from "@/lib/music";
import CoverPicture from "./cover-picture";
import DownloadButton from "./download-button";
import { SongLink } from "./music-links";
import PlayButton from "./play-button";
import { usePlayer } from "./player";
import { PlayIcon, ShuffleIcon } from "./player-icons";
import VisibleList from "./visible-list";

function length(seconds: number | undefined) {
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

type FullList = { playlist?: string; artist?: string; library?: string; sort?: string };

async function fetchFullList(fullList: FullList): Promise<MusicSong[]> {
  const query = new URLSearchParams();
  if (fullList.playlist) query.set("playlist", fullList.playlist);
  if (fullList.artist) query.set("artist", fullList.artist);
  if (fullList.library) query.set("library", fullList.library);
  if (fullList.sort) query.set("sort", fullList.sort);
  const response = await fetch(`/api/music/list?${query}`);
  const answer = (await response.json().catch(() => null)) as { songs?: MusicSong[] } | null;
  return response.ok ? (answer?.songs ?? []) : [];
}

export default function MusicList({
  songs,
  firstNumber = 1,
  autoplay = false,
  shuffleAll,
  fullList,
  download,
}: {
  songs: MusicSong[];
  download?: string;
  firstNumber?: number;
  autoplay?: boolean;
  shuffleAll?: { library?: string; q?: string };
  fullList?: FullList;
}) {
  const { playAll, playFrom, shuffle, toggleShuffle } = usePlayer();
  const [busy, setBusy] = useState(false);

  async function play() {
    if (fullList) {
      setBusy(true);
      try {
        const everything = await fetchFullList(fullList);
        const list = everything.length > 0 ? everything : songs;
        playFrom(list, shuffle ? Math.floor(Math.random() * list.length) : 0);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!shuffle || !shuffleAll) {
      playFrom(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0);
      return;
    }
    setBusy(true);
    try {
      const query = new URLSearchParams();
      if (shuffleAll.library) query.set("library", shuffleAll.library);
      if (shuffleAll.q) query.set("q", shuffleAll.q);
      const response = await fetch(`/api/music/shuffle?${query}`);
      const answer = (await response.json().catch(() => null)) as { songs?: MusicSong[] } | null;
      const everything = response.ok ? (answer?.songs ?? []) : [];
      if (everything.length > 0) playAll(everything);
      else playFrom(songs, Math.floor(Math.random() * songs.length));
    } finally {
      setBusy(false);
    }
  }
  const started = useRef(false);
  const latest = useRef({ playFrom, shuffle, songs, fullList });
  latest.current = { playFrom, shuffle, songs, fullList };

  useEffect(() => {
    if (!autoplay || started.current) return;
    started.current = true;
    const address = new URL(window.location.href);
    address.searchParams.delete("play");
    window.history.replaceState(window.history.state, "", address);
    const timer = setTimeout(async () => {
      const { playFrom, shuffle, songs, fullList } = latest.current;
      const everything = fullList ? await fetchFullList(fullList).catch(() => []) : [];
      const list = everything.length > 0 ? everything : songs;
      if (list.length > 0) playFrom(list, shuffle ? Math.floor(Math.random() * list.length) : 0);
    }, 0);
    return () => {
      clearTimeout(timer);
      started.current = false;
    };
  }, [autoplay]);

  if (songs.length === 0) return <p className="muted">No songs here.</p>;
  return (
    <>
      <div className="music-actions">
        <button
          type="button"
          className="music-play"
          onClick={play}
          disabled={busy}
          title={shuffle && shuffleAll ? "Shuffle everything here, not just this page" : undefined}
        >
          <PlayIcon size={18} /> Play
        </button>
        <button
          type="button"
          className="icon-button player-toggle"
          aria-label="Shuffle"
          aria-pressed={shuffle}
          title={shuffle ? "Shuffle is on" : "Shuffle is off"}
          onClick={toggleShuffle}
        >
          <ShuffleIcon size={18} />
        </button>
        {download && (
          <DownloadButton
            tracks={downloadTracks(songs)}
            name={download}
            loadTracks={fullList ? async () => downloadTracks(await fetchFullList(fullList)) : undefined}
          />
        )}
      </div>
      <VisibleList
        className="music-songs"
        start={firstNumber}
        items={songs}
        guessedHeight={54}
        renderItem={(song, i) => (
          <li key={`${song.songId ?? song.trackId}-${i}`}>
            <span className="music-number">{firstNumber + i}</span>
            {song.cover ? (
              <CoverPicture src={song.cover} shown={40} lazy />
            ) : (
              <span className="music-cover-empty" aria-hidden="true" />
            )}
            <span className="music-song">
              <strong>{song.newSong ? song.title : <SongLink trackId={song.trackId}>{song.title}</SongLink>}</strong>
              <span className="muted">
                {song.artistHref ? (
                  <Link className="music-link" href={song.artistHref} prefetch={false}>
                    {song.artist}
                  </Link>
                ) : (
                  song.artist
                )}
                {song.album && " · "}
                {song.album &&
                  (song.albumHref ? (
                    <Link className="music-link" href={song.albumHref} prefetch={false}>
                      {song.album}
                    </Link>
                  ) : (
                    song.album
                  ))}
              </span>
            </span>
            <span className="music-length muted">{length(song.duration)}</span>
            <PlayButton track={song} onPlay={() => playFrom(songs, i)} />
          </li>
        )}
      />
    </>
  );
}
