"use client";

import { useState, useTransition } from "react";
import { deletePlaysAction } from "@/app/history/actions";
import type { AlbumRef } from "@/lib/albums";
import { useConfirm } from "./confirm-dialog";
import HistoryRow from "./history-row";

export type HistoryPlay = {
  playId: string;
  trackId: string;
  playedAt: string;
  when: string;
  title: string;
  artist: string;
  cover?: string;
  album?: AlbumRef;
};

export default function HistoryTable({ plays }: { plays: HistoryPlay[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirm, dialog] = useConfirm();
  const chosen = plays.filter((play) => selected.has(play.playId));
  const allSelected = chosen.length === plays.length;

  function select(playId: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(playId);
    else next.delete(playId);
    setSelected(next);
  }

  function selectAll(on: boolean) {
    setSelected(new Set(on ? plays.map((play) => play.playId) : []));
  }

  async function removeSelected() {
    const count = chosen.length === 1 ? "1 play" : `${chosen.length} plays`;
    if (!(await confirm(`Delete ${count}?`, { message: "This can't be undone.", confirmLabel: `Delete ${count}` }))) {
      return;
    }
    startTransition(async () => {
      const problem = await deletePlaysAction(chosen.map(({ playId, playedAt }) => ({ playId, playedAt })));
      setError(problem);
      setSelected(new Set());
    });
  }

  return (
    <>
      {chosen.length > 0 && (
        <div className="toolbar selection-bar">
          <span>{chosen.length === 1 ? "1 play selected" : `${chosen.length} plays selected`}</span>
          <button type="button" className="danger-button" onClick={removeSelected} disabled={pending}>
            {pending ? "Deleting…" : "Delete selected"}
          </button>
          <button type="button" onClick={() => selectAll(false)} disabled={pending}>
            Clear
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {dialog}
      <table>
        <thead>
          <tr>
            <th className="select">
              <input
                type="checkbox"
                aria-label="Select all plays on this page"
                checked={allSelected}
                ref={(box) => {
                  if (box) box.indeterminate = chosen.length > 0 && !allSelected;
                }}
                disabled={pending}
                onChange={(event) => selectAll(event.target.checked)}
              />
            </th>
            <th>Played</th>
            <th>Track</th>
            <th>Artist</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {plays.map((play) => (
            <HistoryRow
              key={play.playId}
              {...play}
              selected={selected.has(play.playId)}
              deleting={pending && selected.has(play.playId)}
              onSelect={(on) => select(play.playId, on)}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}
