"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type SignupState, signup } from "./actions";

export default function SignupForm({ invite }: { invite?: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, {});

  return (
    <form action={action} className="stack">
      {invite && <input type="hidden" name="invite" value={invite} />}
      <label>
        Username
        <input name="username" defaultValue={state.username} required autoComplete="username" />
      </label>
      <label>
        Password
        <input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
      {state.created && (
        <p>
          Account <strong>{state.created}</strong> created. <Link href="/login">Log in</Link>
          <br />
          <span className="muted">Your profile is public. You can make it private in Settings.</span>
        </p>
      )}
    </form>
  );
}
