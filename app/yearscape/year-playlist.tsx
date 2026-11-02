"use client";

import { useState, useTransition } from "react";
import { type SaveYearState, saveYearPlaylist } from "./actions";

const SHOWN_MISSING = 5;

function Result({ state }: { state: SaveYearState }) {
  if (state.error) return <p className="error">{state.error}</p>;
  if (!state.saved) return null;
  const { playlist, songs, found, missing } = state.saved;
  if (found === 0) return <p>None of your top songs are in your Navidrome library, so no playlist was saved.</p>;
  const others = missing.length - SHOWN_MISSING;
  return (
    <div>
      <p>
        Saved {found === songs ? `all ${songs}` : `${found} of your top ${songs}`} songs to the playlist{" "}
        <strong>{playlist}</strong> in Navidrome.
      </p>
      {missing.length > 0 && (
        <p className="muted">
          Not in your library:{" "}
          {missing
            .slice(0, SHOWN_MISSING)
            .map((song) => `${song.artist} – ${song.title}`)
            .join(", ")}
          {others > 0 && ` and ${others} more`}.
        </p>
      )}
    </div>
  );
}

export default function YearPlaylist({ year }: { year: number }) {
  const [state, setState] = useState<SaveYearState>({});
  const [pending, startTransition] = useTransition();

  return (
    <div className="stack">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await saveYearPlaylist(year)))}
      >
        {pending ? "Looking in Navidrome…" : `Save my top 50 to Navidrome`}
      </button>
      <Result state={state} />
    </div>
  );
}
