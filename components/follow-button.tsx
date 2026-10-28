"use client";

import { useState, useTransition } from "react";
import { followAction, unfollowAction } from "@/app/u/[username]/actions";

export default function FollowButton({ username, following }: { username: string; following: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => setError(await (following ? unfollowAction : followAction)(username)));
  }

  return (
    <>
      <button
        type="button"
        className={following ? "follow-button following" : "follow-button"}
        aria-pressed={following}
        disabled={pending}
        onClick={toggle}
      >
        {following ? "Unfollow" : "Follow"}
      </button>
      {error && <small className="error">{error}</small>}
    </>
  );
}
