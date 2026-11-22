"use client";

import Link from "next/link";
import PlayAllButton from "./play-all-button";
import PlayButton from "./play-button";
import { type PlayerTrack, usePlayerActions } from "./player";
import RadioButton from "./radio-button";
import VisibleList from "./visible-list";

export type ArtistSongRow = {
  key: string;
  title: string;
  href?: string;
  stats: string;
  track: PlayerTrack;
};

const DIRECT_ROW_LIMIT = 40;

export default function ArtistSongs({
  rows,
  canPlay,
  artistId,
  artistName,
  hasNavidrome,
  navidromeArtistId,
  songsTruncated,
  hasUnplayed,
}: {
  rows: ArtistSongRow[];
  canPlay: boolean;
  artistId: string;
  artistName: string;
  hasNavidrome: boolean;
  navidromeArtistId?: string;
  songsTruncated?: boolean;
  hasUnplayed: boolean;
}) {
  const { playFrom } = usePlayerActions();
  const playable = rows.map((row) => row.track);
  const listClass = ["chart", canPlay && "playable", rows.length >= 100 && "disc-numbers"].filter(Boolean).join(" ");

  const renderRow = (row: ArtistSongRow, index: number) => (
    <li key={row.key}>
      <span className="muted">{index + 1}</span>
      <span className={row.href ? undefined : "muted"}>
        {row.href ? (
          <Link href={row.href} prefetch={false}>
            {row.title}
          </Link>
        ) : (
          row.title
        )}
        <small className="muted stats">{row.stats}</small>
      </span>
      {canPlay && <PlayButton track={row.track} onPlay={() => playFrom(playable, index)} />}
    </li>
  );

  return (
    <section>
      <div className="section-head">
        <h2>{hasUnplayed ? "Songs" : "Top songs"}</h2>
        <div className="export-buttons">
          {hasNavidrome && (
            <RadioButton seed={{ artistId }} label={`Songs by ${artistName} and similar artists from your Navidrome`} />
          )}
          {canPlay && <PlayAllButton tracks={playable} />}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">Nobody has played this artist yet.</p>
      ) : rows.length <= DIRECT_ROW_LIMIT ? (
        <ol className={listClass}>{rows.map(renderRow)}</ol>
      ) : (
        <VisibleList as="ol" className={listClass} items={rows} guessedHeight={54} renderItem={renderRow} />
      )}
      {songsTruncated && navidromeArtistId && (
        <p className="muted">
          Showing songs from the first albums.{" "}
          <Link href={`/music?artist=${encodeURIComponent(navidromeArtistId)}`} prefetch={false}>
            Browse all songs in Music
          </Link>
        </p>
      )}
    </section>
  );
}
