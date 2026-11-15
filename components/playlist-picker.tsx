"use client";

import { useEffect, useState } from "react";
import type { PlayerTrack } from "./player";

type Playlist = { id: string; name: string };

async function send(method: "GET" | "POST", body?: unknown) {
  const response = await fetch("/api/music/playlist-songs", {
    method,
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const answer = await response.json().catch(() => null);
  if (!response.ok) throw new Error(answer?.error ?? "Navidrome didn't answer");
  return answer;
}

export default function PlaylistPicker({ track, onDone }: { track: PlayerTrack; onDone: (message: string) => void }) {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    send("GET")
      .then((answer) => setPlaylists(answer.playlists ?? []))
      .catch((error: Error) => setProblem(error.message));
  }, []);

  async function add(target: { playlistId: string } | { name: string }, label: string) {
    setBusy(true);
    setProblem(null);
    try {
      await send("POST", { trackId: track.trackId, ...(track.songId ? { songId: track.songId } : {}), ...target });
      onDone(`Added to ${label}`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Navidrome didn't answer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="playlist-picker">
      {problem && <p className="muted">{problem}</p>}
      {!problem && playlists === null && <p className="muted">Loading playlists…</p>}
      {playlists?.map((playlist) => (
        <button
          type="button"
          key={playlist.id}
          disabled={busy}
          onClick={() => add({ playlistId: playlist.id }, playlist.name)}
        >
          {playlist.name}
        </button>
      ))}
      {playlists && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) add({ name: name.trim() }, name.trim());
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New playlist"
            aria-label="New playlist name"
            maxLength={100}
          />
          <button type="submit" disabled={busy || !name.trim()}>
            Create
          </button>
        </form>
      )}
    </div>
  );
}
