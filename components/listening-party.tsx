"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "@/lib/copy";
import type { HandedTrack } from "@/lib/devices";
import type { PartyView } from "@/lib/parties";

const IN_PARTY_EVERY_MS = 5000;
const OUT_OF_PARTY_EVERY_MS = 60_000;

export type PartyControls = {
  party: PartyView | null;
  start: () => Promise<string | null>;
  join: (id: string) => Promise<string | null>;
  leave: () => Promise<void>;
  invite: (users: string[]) => Promise<string | null>;
  add: (track: HandedTrack, next: boolean) => Promise<string | null>;
};

async function answer(response: Response) {
  const body = (await response.json().catch(() => null)) as { party?: PartyView | null; error?: string } | null;
  return { ok: response.ok, party: body?.party ?? null, error: body?.error ?? null };
}

export function useParty(username: string | null, deviceId: () => string | null): PartyControls {
  const [party, setParty] = useState<PartyView | null>(null);
  const partyRef = useRef<PartyView | null>(null);
  partyRef.current = party;
  const deviceRef = useRef(deviceId);
  deviceRef.current = deviceId;

  const refresh = useCallback(async () => {
    const response = await fetch("/api/party", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const next = (await answer(response)).party;
    setParty((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  const inParty = party !== null;

  useEffect(() => {
    if (!username) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      if (!document.hidden) await refresh();
      if (!stopped) timer = setTimeout(tick, partyRef.current ? IN_PARTY_EVERY_MS : OUT_OF_PARTY_EVERY_MS);
    };
    timer = setTimeout(tick, inParty ? IN_PARTY_EVERY_MS : 0);
    const wake = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [username, refresh, inParty]);

  async function start() {
    const response = await fetch("/api/party", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: deviceRef.current() }),
    });
    const result = await answer(response);
    if (result.ok) setParty(result.party);
    return result.error;
  }

  async function join(id: string) {
    const device = deviceRef.current();
    if (!device) return "This device isn't connected yet. Try again in a moment.";
    const response = await fetch(`/api/party/${encodeURIComponent(id)}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: device }),
    });
    const result = await answer(response);
    if (result.ok) setParty(result.party);
    return result.error;
  }

  async function leave() {
    await fetch("/api/party", { method: "DELETE" }).catch(() => null);
    setParty(null);
  }

  async function invite(users: string[]) {
    const current = partyRef.current;
    if (!current) return "Start a listening party first.";
    const response = await fetch(`/api/party/${current.id}/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ users }),
    });
    return (await answer(response)).error;
  }

  async function add(track: HandedTrack, next: boolean) {
    const current = partyRef.current;
    if (!current) return "You're not at a listening party.";
    const response = await fetch(`/api/party/${current.id}/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ track, next }),
    });
    const problem = (await answer(response)).error;
    if (!problem) setTimeout(refresh, 1500);
    return problem;
  }

  const actions = useRef({ start, join, leave, invite, add });
  actions.current = { start, join, leave, invite, add };
  return useMemo(
    () => ({
      party,
      start: () => actions.current.start(),
      join: (id: string) => actions.current.join(id),
      leave: () => actions.current.leave(),
      invite: (users: string[]) => actions.current.invite(users),
      add: (track: HandedTrack, next: boolean) => actions.current.add(track, next),
    }),
    [party],
  );
}

function partyLink(id: string) {
  return typeof window === "undefined" ? `/party/${id}` : `${window.location.origin}/party/${id}`;
}

function UpNextList({ party }: { party: PartyView }) {
  if (party.upNext.length === 0) return <p className="muted">Nothing queued yet. Add songs with Add to queue.</p>;
  return (
    <ol className="party-up-next">
      {party.upNext.map((next, at) => (
        <li key={`${at}:${next.trackId}`}>
          <span className="party-song">
            {next.title} <span className="muted">· {next.artist}</span>
          </span>
          {next.addedBy && <span className="party-added muted">added by {next.addedBy}</span>}
        </li>
      ))}
    </ol>
  );
}

function Friends({ onInvite }: { onInvite: (users: string[]) => Promise<string | null> }) {
  const [friends, setFriends] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/party/friends", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { friends?: string[] }) => setFriends(body.friends ?? []))
      .catch(() => setFriends([]));
  }, []);

  if (friends === null) return null;
  if (friends.length === 0) return <p className="muted">Follow people to invite them, or share the link.</p>;
  return (
    <div className="party-invite">
      <ul className="party-friends">
        {friends.map((friend) => (
          <li key={friend}>
            <label>
              <input
                type="checkbox"
                checked={chosen.includes(friend)}
                onChange={(event) =>
                  setChosen(event.target.checked ? [...chosen, friend] : chosen.filter((name) => name !== friend))
                }
              />{" "}
              {friend}
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="secondary"
        disabled={chosen.length === 0}
        onClick={async () => {
          const problem = await onInvite(chosen);
          setMessage(problem ?? `Invited ${chosen.join(", ")}.`);
          if (!problem) setChosen([]);
        }}
      >
        Invite
      </button>
      {message && <p className="muted">{message}</p>}
    </div>
  );
}

export function PartySection({ controls }: { controls: PartyControls }) {
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const party = controls.party;

  if (!party || party.role === "visitor") {
    return (
      <div className="party-section">
        <h3>Listening party</h3>
        <p className="muted">
          Start a listening party and friends hear what you play and can add songs. Only you control what plays.
        </p>
        <button type="button" className="secondary" onClick={async () => setMessage(await controls.start())}>
          Start a listening party
        </button>
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
      </div>
    );
  }

  const people = party.guests.length === 1 ? "1 person" : `${party.guests.length} people`;
  if (party.role === "guest") {
    return (
      <div className="party-section">
        <h3>At {party.host}&apos;s listening party</h3>
        <p className="muted">
          {party.host} controls playback. You can add songs with Add to queue and Play next.
          {party.guests.length > 1 && ` ${people} are listening.`}
        </p>
        <UpNextList party={party} />
        <button type="button" className="secondary" onClick={() => controls.leave()}>
          Leave the party
        </button>
      </div>
    );
  }

  const link = partyLink(party.id);
  return (
    <div className="party-section">
      <h3>Your listening party</h3>
      <p className="muted">
        {party.guests.length === 0 ? "Nobody has joined yet." : `${people} listening: ${party.guests.join(", ")}.`}
      </p>
      <div className="party-link">
        <input type="text" readOnly value={link} aria-label="Party link" onFocus={(event) => event.target.select()} />
        <button
          type="button"
          className="secondary"
          onClick={async (event) => {
            if (await copyText(link)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } else {
              event.currentTarget.parentElement?.querySelector("input")?.select();
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <Friends onInvite={controls.invite} />
      <UpNextList party={party} />
      <button type="button" className="secondary" onClick={() => controls.leave()}>
        End the party
      </button>
    </div>
  );
}

export function JoinParty({ id, host, controls }: { id: string; host: string; controls: PartyControls }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = controls.party;
  if (current?.id === id && current.role === "host")
    return <p>This is your listening party. Share this page&apos;s link.</p>;
  if (current?.id === id && current.role === "guest") {
    return (
      <p>
        You&apos;re at {host}&apos;s listening party.{" "}
        <button type="button" className="secondary" onClick={() => controls.leave()}>
          Leave
        </button>
      </p>
    );
  }
  return (
    <div className="party-join">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(await controls.join(id));
          setBusy(false);
        }}
      >
        Join {host}&apos;s listening party
      </button>
      <p className="muted">
        The music plays on this device. To listen somewhere else, open this link there. <Link href="/">Back home</Link>
      </p>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
