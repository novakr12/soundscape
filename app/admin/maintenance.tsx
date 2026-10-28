"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/components/confirm-dialog";
import { type DuplicatesResult, findDuplicates, removeDuplicates } from "./actions";

function count(value: number, word: string) {
  return `${value.toLocaleString("en")} ${word}${value === 1 ? "" : "s"}`;
}

export default function Maintenance() {
  const [duplicates, setDuplicates] = useState<DuplicatesResult | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [confirm, dialog] = useConfirm();

  function run<T>(name: string, action: () => Promise<T>, done: (result: T) => void) {
    setRunning(name);
    startTransition(async () => {
      done(await action());
      setRunning(null);
    });
  }

  const totalDuplicates = duplicates?.users?.reduce((sum, user) => sum + user.duplicates, 0) ?? 0;

  return (
    <>
      {dialog}
      <div className="stack">
        <h3>Duplicate plays</h3>
        <p className="muted">Plays of the same song within a minute of each other, for example from two imports.</p>
        <button type="button" disabled={running !== null} onClick={() => run("find", findDuplicates, setDuplicates)}>
          {running === "find" ? "Looking…" : "Find duplicate plays"}
        </button>
        {duplicates?.error && <p className="error">{duplicates.error}</p>}
        {duplicates?.removed !== undefined && <p>Removed {count(duplicates.removed, "duplicate play")}.</p>}
        {duplicates?.users && duplicates.removed === undefined && (
          <>
            {duplicates.users.length === 0 ? (
              <p>No duplicate plays.</p>
            ) : (
              <ul>
                {duplicates.users.map((user) => (
                  <li key={user.username}>
                    {user.username}: {count(user.duplicates, "duplicate")}
                  </li>
                ))}
              </ul>
            )}
            {totalDuplicates > 0 && (
              <button
                type="button"
                className="danger-button"
                disabled={running !== null}
                onClick={async () => {
                  const label = `Remove ${count(totalDuplicates, "duplicate")}`;
                  if (!(await confirm(`${label}?`, { message: "The first play of each stays.", confirmLabel: label })))
                    return;
                  run("remove", removeDuplicates, setDuplicates);
                }}
              >
                {running === "remove" ? "Removing…" : `Remove ${count(totalDuplicates, "duplicate")}`}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
