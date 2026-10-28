"use client";

import { useActionState, useEffect, useState } from "react";
import { createInviteLink, type InviteState } from "./actions";

export default function InviteForm({ days }: { days: number }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInviteLink, {});
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
    setLink(state.code ? `${window.location.origin}/signup?invite=${state.code}` : "");
  }, [state.code]);

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <form action={action} className="stack">
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : link ? "Create another invite link" : "Create an invite link"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
      {link && (
        <>
          <div className="invite-link">
            <input value={link} readOnly aria-label="Invite link" onFocus={(event) => event.target.select()} />
            <button type="button" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="muted">Works once, for {days} days. Send it to the person you want to invite.</p>
        </>
      )}
    </form>
  );
}
