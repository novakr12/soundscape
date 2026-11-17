"use client";

import Link from "next/link";
import { downloadTracks } from "@/lib/app-downloads";
import DownloadButton from "./download-button";
import PlayAllButton from "./play-all-button";
import PlayButton from "./play-button";
import { type PlayerTrack, usePlayer } from "./player";

export type AlbumSongRow = {
  key: string;
  position: string;
  title: string;
  href?: string;
  stats: string;
  track?: PlayerTrack;
};

export default function AlbumSongs({ rows, canPlay, name }: { rows: AlbumSongRow[]; canPlay: boolean; name?: string }) {
  const { playFrom } = usePlayer();
  const discs = rows.some((row) => row.position.includes("."));
  const playable = rows.flatMap((row) => (row.track ? [row.track] : []));
  const at = new Map(rows.flatMap((row) => (row.track ? [[row.key, playable.indexOf(row.track)] as const] : [])));
  return (
    <section>
      <div className="section-head">
        <h2>Songs</h2>
        {canPlay && (
          <span className="play-and-download">
            <PlayAllButton tracks={playable} />
            {name && <DownloadButton tracks={downloadTracks(playable)} name={name} />}
          </span>
        )}
      </div>
      <ol className={["chart", canPlay && "playable", discs && "disc-numbers"].filter(Boolean).join(" ")}>
        {rows.map((row) => (
          <li key={row.key} className={row.href || row.track ? undefined : "unplayed"}>
            <span className="muted">{row.position}</span>
            <span className={row.href ? undefined : "muted"}>
              {row.href ? <Link href={row.href}>{row.title}</Link> : row.title}
              <small className="muted stats">{row.stats}</small>
            </span>
            {canPlay && row.track && (
              <PlayButton track={row.track} onPlay={() => playFrom(playable, at.get(row.key) ?? 0)} />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
