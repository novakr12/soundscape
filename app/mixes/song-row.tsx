"use client";

import { useOptimistic, useTransition } from "react";
import Cover from "@/components/cover";
import { ArtistLink, SongLink } from "@/components/music-links";
import PlayButton from "@/components/play-button";
import { setWanted } from "./actions";

export type RowSong = {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  deezerId?: number;
  note?: string;
};

export type RowStatus = "found" | "missing";

function findLinks(song: RowSong) {
  const query = encodeURIComponent(`${song.artist} ${song.title}`);
  return [
    {
      label: "Deezer",
      href: song.deezerId ? `https://www.deezer.com/track/${song.deezerId}` : `https://www.deezer.com/search/${query}`,
    },
    { label: "YouTube", href: `https://www.youtube.com/results?search_query=${query}` },
    { label: "Bandcamp", href: `https://bandcamp.com/search?q=${query}&item_type=t` },
  ];
}

export default function SongRow({ song, wanted, status }: { song: RowSong; wanted: boolean; status?: RowStatus }) {
  const [pending, startTransition] = useTransition();
  const [shownWanted, setShownWanted] = useOptimistic(wanted);

  function toggle() {
    startTransition(async () => {
      setShownWanted(!shownWanted);
      await setWanted(song.trackId, !shownWanted);
    });
  }

  return (
    <li className={status === "missing" ? "mix-song missing" : "mix-song"}>
      <Cover src={song.cover} />
      <span className="listening-info">
        <span>
          <SongLink trackId={song.trackId}>{song.title}</SongLink>{" "}
          <span className="muted">
            · <ArtistLink name={song.artist} />
          </span>
        </span>
        {song.note && <small className="muted">{song.note}</small>}
        <small className="find-links">
          {findLinks(song).map((link, index) => (
            <span key={link.label}>
              {index > 0 && <span className="muted"> · </span>}
              <a href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </span>
          ))}
        </small>
      </span>
      <span className="mix-actions">
        {status === "found" && <span className="tag">In Navidrome</span>}
        {status === "missing" && <span className="tag missing">Not in library</span>}
        <PlayButton track={{ trackId: song.trackId, title: song.title, artist: song.artist, cover: song.cover }} />
        {status !== "found" && (
          <button type="button" onClick={toggle} disabled={pending} aria-pressed={shownWanted}>
            {shownWanted ? "★ Wanted" : "☆ Want"}
          </button>
        )}
      </span>
    </li>
  );
}
