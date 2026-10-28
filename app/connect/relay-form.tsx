"use client";

import { useActionState } from "react";
import { type RelayFormState, startRelay } from "./actions";

export default function RelayForm() {
  const [state, action, pending] = useActionState<RelayFormState, FormData>(startRelay, {});

  return (
    <form action={action} className="stack">
      <label>
        ListenBrainz user token
        <input name="listenBrainzToken" required autoComplete="off" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Forward to ListenBrainz"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
