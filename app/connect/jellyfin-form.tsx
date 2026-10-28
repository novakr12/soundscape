"use client";

import { useActionState } from "react";
import { connectJellyfin, type JellyfinFormState } from "./actions";

export default function JellyfinForm() {
  const [state, action, pending] = useActionState<JellyfinFormState, FormData>(connectJellyfin, {});

  return (
    <form action={action} className="stack">
      <label>
        Jellyfin address
        <input
          name="url"
          type="url"
          required
          placeholder="http://localhost:8096"
          autoComplete="url"
          defaultValue={state.url}
        />
      </label>
      <label>
        API key
        <input name="apiKey" required autoComplete="off" />
      </label>
      <label>
        Your Jellyfin username
        <input name="username" required autoComplete="off" defaultValue={state.username} />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Connect Jellyfin"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
