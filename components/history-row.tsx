"use client";

import { useState, useTransition } from "react";
import { deletePlayAction, editPlayAction } from "@/app/history/actions";
import { useConfirm } from "@/components/confirm-dialog";
import Cover from "@/components/cover";
import { ArtistLink } from "@/components/music-links";
import TrackCell from "@/components/track-cell";
import type { AlbumRef } from "@/lib/albums";

type Props = {
  selected: boolean;
  deleting: boolean;
  onSelect: (selected: boolean) => void;
  playId: string;
  trackId: string;
  playedAt: string;
  when: string;
  title: string;
  artist: string;
  cover?: string;
  album?: AlbumRef;
};

export default function HistoryRow(props: Props) {
  const { selected, deleting, onSelect, playId, trackId, playedAt, when, title, artist, cover, album } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title, artist });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirm, dialog] = useConfirm();
  const play = { playId, playedAt };
  const unchanged = draft.title.trim() === title && draft.artist.trim() === artist;
  const empty = !draft.title.trim() || !draft.artist.trim();

  function cancel() {
    setEditing(false);
    setDraft({ title, artist });
    setError(null);
  }

  function save() {
    if (unchanged) return cancel();
    if (empty) return;
    startTransition(async () => {
      const problem = await editPlayAction(play, draft.artist, draft.title);
      setError(problem);
      if (!problem) setEditing(false);
    });
  }

  async function remove() {
    if (!(await confirm("Delete this play?", { message: `${title} by ${artist}, played ${when}.` }))) return;
    startTransition(async () => setError(await deletePlayAction(play)));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") save();
    if (event.key === "Escape") cancel();
  }

  return (
    <tr className={pending || deleting ? "pending" : selected ? "selected" : undefined}>
      <td className="select">
        <input
          type="checkbox"
          aria-label={`Select ${title} by ${artist}`}
          checked={selected}
          disabled={pending || deleting}
          onChange={(event) => onSelect(event.target.checked)}
        />
      </td>
      <td className="muted">{when}</td>
      {editing ? (
        <>
          <td>
            <span className="track-cell">
              <Cover src={cover} />
              <input
                aria-label="Track"
                value={draft.title}
                autoFocus
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onKeyDown={onKeyDown}
              />
            </span>
          </td>
          <td>
            <input
              aria-label="Artist"
              value={draft.artist}
              onChange={(e) => setDraft({ ...draft, artist: e.target.value })}
              onKeyDown={onKeyDown}
            />
          </td>
        </>
      ) : (
        <>
          <td>
            <TrackCell trackId={trackId} title={title} cover={cover} album={album} />
          </td>
          <td>
            <ArtistLink name={artist} />
          </td>
        </>
      )}
      <td className="row-actions">
        {editing ? (
          <>
            <button type="button" onClick={save} disabled={pending || empty}>
              Save
            </button>
            <button type="button" onClick={cancel} disabled={pending}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)} disabled={pending}>
              Edit
            </button>
            <button type="button" className="danger" onClick={remove} disabled={pending}>
              Delete
            </button>
          </>
        )}
        {error && <small className="error row-error">{error}</small>}
        {dialog}
      </td>
    </tr>
  );
}
