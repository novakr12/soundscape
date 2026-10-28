"use client";

import { useActionState } from "react";
import { type ChangePasswordState, changeMyPassword } from "./actions";

export default function ChangePasswordForm({ changed }: { changed: boolean }) {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(changeMyPassword, {});

  return (
    <form action={action} className="stack">
      <label>
        Current password
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <label>
        New password
        <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <label>
        New password again
        <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Changing…" : "Change password"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
      {changed && !state.error && <p>Password changed. Your other devices have been logged out.</p>}
    </form>
  );
}
