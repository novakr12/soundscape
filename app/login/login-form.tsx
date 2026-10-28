"use client";

import { useActionState } from "react";
import { type LoginState, login } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="stack">
      <label>
        Username
        <input name="username" defaultValue={state.username} required autoComplete="username" />
      </label>
      <label>
        Password
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
