"use client";

import { useActionState } from "react";
import { connectNavidrome, type NavidromeFormState } from "./actions";

export default function NavidromeForm() {
  const [state, action, pending] = useActionState<NavidromeFormState, FormData>(connectNavidrome, {});

  return (
    <form action={action} className="stack">
      <label>
        Navidrome address
        <input
          name="url"
          type="url"
          required
          placeholder="http://localhost:4533"
          autoComplete="url"
          defaultValue={state.url}
        />
      </label>
      <label>
        Username
        <input name="username" required autoComplete="off" defaultValue={state.username} />
      </label>
      <label>
        Password
        <input name="password" type="password" required autoComplete="off" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Connect Navidrome"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
