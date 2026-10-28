"use client";

import { useActionState } from "react";
import { type DeleteAccountState, deleteMyAccount } from "./actions";

export default function DeleteAccountForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteMyAccount, {});

  return (
    <form action={action} className="stack">
      <label>
        <span>
          Type your username, <strong>{username}</strong>, to confirm
        </span>
        <input name="username" required autoComplete="off" autoCapitalize="none" spellCheck={false} />
      </label>
      <label>
        Your password
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <button type="submit" className="danger-button" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
