"use client";

import { revokeDeviceToken } from "./actions";

export default function RevokeButton({ id, name }: { id: number; name: string }) {
  return (
    <form action={revokeDeviceToken}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`Revoke ${name}`}
        onClick={(event) => {
          if (!window.confirm(`Revoke the token "${name}"? Apps that use it stop sending plays.`))
            event.preventDefault();
        }}
      >
        Revoke
      </button>
    </form>
  );
}
