"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  type LibraryEditResult,
  mergeArtistAction,
  mergeSongAction,
  renameArtistAction,
  renameSongAction,
} from "@/app/admin/actions";
import { useConfirm } from "@/components/confirm-dialog";

function useLibraryEdit() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<LibraryEditResult>) =>
    startTransition(async () => {
      setError(null);
      const result = await work();
      if (result.error) setError(result.error);
      else if (result.path) {
        router.push(result.path);
        router.refresh();
      }
    });
  return { error, pending, run };
}

export function ArtistTools({ artistId, name }: { artistId: string; name: string }) {
  const [newName, setNewName] = useState(name);
  const [into, setInto] = useState("");
  const { error, pending, run } = useLibraryEdit();
  const [confirm, dialog] = useConfirm();

  return (
    <details className="library-tools">
      <summary>Fix this artist (admin)</summary>
      {dialog}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => renameArtistAction(artistId, newName));
        }}
      >
        <label>
          Name
          <input value={newName} onChange={(event) => setNewName(event.target.value)} required />
        </label>
        <button type="submit" disabled={pending || newName.trim() === name}>
          Rename
        </button>
      </form>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const ok = await confirm(`Merge ${name} into ${into.trim()}?`, {
            message: "Every song, album and play moves over, and new plays under this name will follow.",
            confirmLabel: "Merge",
          });
          if (ok) run(() => mergeArtistAction(artistId, into));
        }}
      >
        <label>
          Merge into the artist called
          <input value={into} onChange={(event) => setInto(event.target.value)} required />
        </label>
        <button type="submit" disabled={pending || !into.trim()}>
          Merge
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </details>
  );
}

export function SongTools({
  trackId,
  title,
  songs,
}: {
  trackId: string;
  title: string;
  songs: { trackId: string; title: string }[];
}) {
  const [newTitle, setNewTitle] = useState(title);
  const [into, setInto] = useState("");
  const { error, pending, run } = useLibraryEdit();
  const [confirm, dialog] = useConfirm();
  const target = songs.find((song) => song.trackId === into);

  return (
    <details className="library-tools">
      <summary>Fix this song (admin)</summary>
      {dialog}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => renameSongAction(trackId, newTitle));
        }}
      >
        <label>
          Title
          <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} required />
        </label>
        <button type="submit" disabled={pending || newTitle.trim() === title}>
          Rename
        </button>
      </form>
      {songs.length > 0 && (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!target) return;
            const ok = await confirm(`Merge ${title} into ${target.title}?`, {
              message: "Every play moves over, and new plays of this song will follow.",
              confirmLabel: "Merge",
            });
            if (ok) run(() => mergeSongAction(trackId, target.trackId));
          }}
        >
          <label>
            Merge into another song by this artist
            <select value={into} onChange={(event) => setInto(event.target.value)} required>
              <option value="">Choose a song</option>
              {songs.map((song) => (
                <option key={song.trackId} value={song.trackId}>
                  {song.title}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending || !target}>
            Merge
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </details>
  );
}
