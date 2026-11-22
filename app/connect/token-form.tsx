"use client";

import { useActionState, useEffect, useState } from "react";
import { copyText } from "@/lib/copy";
import { createDeviceToken, type TokenFormState } from "./actions";

export default function TokenForm() {
  const [state, action, pending] = useActionState<TokenFormState, FormData>(createDeviceToken, {});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.token) setCopied(false);
  }, [state.token]);

  async function copy() {
    if (state.token && (await copyText(state.token))) {
      setCopied(true);
    }
  }

  return (
    <>
      <form action={action} className="stack token-form">
        <label>
          Name
          <input name="name" required maxLength={60} placeholder="For example Navidrome or Phone" autoComplete="off" />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create token"}
        </button>
        {state.error && <p className="error">{state.error}</p>}
      </form>
      {state.token && (
        <div className="new-token" role="status">
          <p>
            Your token for <strong>{state.name}</strong>:
          </p>
          <div className="new-token-row">
            <code className="token">{state.token}</code>
            <button type="button" className="secondary" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="muted">Copy it now. It won&apos;t be shown again.</p>
        </div>
      )}
    </>
  );
}
