"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { MixKind } from "@/lib/mixes";
import { type SaveMixState, saveMix } from "./actions";
import SongRow, { type RowSong } from "./song-row";

type Props = {
  kind: MixKind;
  title: string;
  description: string;
  empty: string;
  playlist: string;
  songs: RowSong[];
  wanted: string[];
  connected: boolean;
};

function songCount(count: number) {
  return `${count} ${count === 1 ? "song" : "songs"}`;
}

function Summary({ state, total, playlist }: { state: SaveMixState; total: number; playlist: string }) {
  if (state.error) return <p className="error">{state.error}</p>;
  if (!state.saved) return null;
  const { found, missing, arrived } = state.saved;
  const one = (count: number, singular: string, plural: string) => (count === 1 ? singular : plural);
  return (
    <div className="mix-summary">
      {found.length + arrived.length === 0 ? (
        <p>None of these songs are in your Navidrome library yet, so no playlist was saved.</p>
      ) : (
        <p>
          Saved {found.length} of {songCount(total)} to <strong>{playlist}</strong> in Navidrome.
          {missing.length > 0 &&
            ` ${songCount(missing.length)} ${one(missing.length, "isn't", "aren't")} in your library yet.`}
        </p>
      )}
      {arrived.length > 0 && (
        <p>
          {songCount(arrived.length)} from your want list {one(arrived.length, "is", "are")} in Navidrome now and{" "}
          {one(arrived.length, "was", "were")} added too:{" "}
          {arrived.map((song) => `${song.title} by ${song.artist}`).join(", ")}.
        </p>
      )}
    </div>
  );
}

export default function MixSection({ kind, title, description, empty, playlist, songs, wanted, connected }: Props) {
  const [state, setState] = useState<SaveMixState>({});
  const [pending, startTransition] = useTransition();
  const wantedIds = new Set(wanted);
  const found = new Set(state.saved?.found);
  const missing = new Set(state.saved?.missing);

  function save() {
    startTransition(async () => setState(await saveMix(kind)));
  }

  return (
    <section>
      <div className="section-head">
        <h2>{title}</h2>
        {songs.length > 0 &&
          (connected ? (
            <button type="button" className="follow-button" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save to Navidrome"}
            </button>
          ) : (
            <Link href="/connect#navidrome-library">Connect Navidrome to save this mix</Link>
          ))}
      </div>
      <p className="muted">{description}</p>
      <Summary state={state} total={songs.length} playlist={playlist} />
      {songs.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="listening-list mix-list">
          {songs.map((song) => (
            <SongRow
              key={song.trackId}
              song={song}
              wanted={wantedIds.has(song.trackId)}
              status={found.has(song.trackId) ? "found" : missing.has(song.trackId) ? "missing" : undefined}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
