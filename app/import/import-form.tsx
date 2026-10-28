"use client";

import { useActionState } from "react";
import { type ImportFormState, runImport } from "./actions";

export default function ImportForm({ defaultUser }: { defaultUser?: string }) {
  const [state, action, pending] = useActionState<ImportFormState, FormData>(runImport, {});

  return (
    <form action={action} className="stack">
      <label>
        ListenBrainz username
        <input name="listenBrainzUser" defaultValue={state.listenBrainzUser ?? defaultUser} required />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Importing…" : "Import listens"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
      {state.message && <p>{state.message}</p>}
    </form>
  );
}
