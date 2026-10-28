"use client";

import { useState, useTransition } from "react";
import { type CheckWantedState, checkWanted } from "./actions";
import SongRow, { type RowSong } from "./song-row";

export default function WantList({ songs, connected }: { songs: RowSong[]; connected: boolean }) {
  const [state, setState] = useState<CheckWantedState>({});
  const [pending, startTransition] = useTransition();

  function check() {
    startTransition(async () => setState(await checkWanted()));
  }

  return (
    <section>
      <div className="section-head">
        <h2>Want list</h2>
        {connected && songs.length > 0 && (
          <button type="button" className="follow-button following" onClick={check} disabled={pending}>
            {pending ? "Checking…" : "Check Navidrome"}
          </button>
        )}
      </div>
      <p className="muted">
        Songs you want to add to your library. Once a song is in Navidrome it leaves this list. Saving a mix checks this
        list too and adds the songs that arrived to that playlist.
      </p>
      {state.error && <p className="error">{state.error}</p>}
      {state.arrived && (
        <p className="mix-summary">
          {state.arrived.length === 0
            ? "None of them are in Navidrome yet."
            : `In Navidrome now: ${state.arrived.map((song) => `${song.title} by ${song.artist}`).join(", ")}.`}
        </p>
      )}
      {songs.length === 0 ? (
        <p className="muted">Nothing here yet. Press Want on a song you don&apos;t have.</p>
      ) : (
        <ul className="listening-list mix-list">
          {songs.map((song) => (
            <SongRow key={song.trackId} song={song} wanted />
          ))}
        </ul>
      )}
    </section>
  );
}
