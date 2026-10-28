"use client";

import { useActionState } from "react";
import { type DeleteHistoryState, deleteHistory } from "./actions";

export default function DeleteHistoryForm() {
  const [state, action, pending] = useActionState<DeleteHistoryState, FormData>(deleteHistory, {});

  return (
    <form action={action} className="stack">
      <label>
        Your password
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <button type="submit" className="danger-button" disabled={pending}>
        {pending ? "Deleting…" : "Delete all my plays"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
      {state.deleted !== undefined && (
        <p>
          Deleted {state.deleted.toLocaleString("en")} {state.deleted === 1 ? "play" : "plays"}.
        </p>
      )}
    </form>
  );
}
