"use client";

import { useState } from "react";
import { ArtistLink } from "@/components/music-links";

const SHOWN = 12;

const monthLabel = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

export default function Discoveries({
  artists,
  showMonth = true,
}: {
  artists: { name: string; month: string }[];
  showMonth?: boolean;
}) {
  const [all, setAll] = useState(false);
  const hidden = artists.length - SHOWN;

  return (
    <>
      <ul className="discoveries">
        {(all ? artists : artists.slice(0, SHOWN)).map((artist) => (
          <li key={artist.name}>
            <ArtistLink name={artist.name} />
            {showMonth && <span className="muted"> · {monthLabel(artist.month)}</span>}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" className="show-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show ${hidden.toLocaleString("en")} more`}
        </button>
      )}
    </>
  );
}
