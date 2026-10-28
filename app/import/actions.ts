"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { type CoverProgress, findCoversAfterImport, getCoverProgress, startCoverSearch } from "@/lib/covers";
import { withoutKnownPlays } from "@/lib/dedupe";
import { importListens } from "@/lib/imports";
import { deleteValues, keys, takeLock } from "@/lib/kv";
import { getLastfmProgress, type LastfmProgress, runLastfmImport, startLastfmImport } from "@/lib/lastfm";
import { ImportError, importFromListenBrainz, MAX_LISTENS_PER_IMPORT } from "@/lib/listenbrainz";
import { requireUserId } from "@/lib/session";
import { SPOTIFY_BATCH, type SpotifyListen } from "@/lib/spotify";

export type ImportFormState = {
  listenBrainzUser?: string;
  error?: string;
  message?: string;
};

export async function runImport(_previous: ImportFormState, formData: FormData): Promise<ImportFormState> {
  const userId = await requireUserId();
  const listenBrainzUser = String(formData.get("listenBrainzUser") ?? "").trim();
  if (!listenBrainzUser) return { error: "Enter your ListenBrainz username." };

  try {
    const result = await importFromListenBrainz(userId, listenBrainzUser);
    const progress = await startCoverSearch(userId);
    if (progress.total > 0) after(() => findCoversAfterImport(userId, progress));
    revalidatePath("/import");

    if (result.imported === 0) return { listenBrainzUser, message: "No new listens since the last import." };
    const truncated = result.truncated
      ? ` Only the newest ${MAX_LISTENS_PER_IMPORT.toLocaleString("en")} were imported.`
      : "";
    return {
      listenBrainzUser,
      message: `Imported ${result.imported.toLocaleString("en")} listens, ${result.catalogNodesCreated} new artists and tracks.${truncated}`,
    };
  } catch (error) {
    if (error instanceof ImportError) return { listenBrainzUser, error: error.message };
    throw error;
  }
}

export type LastfmFormState = { lastfmUser?: string; error?: string; progress?: LastfmProgress };

export async function runLastfm(_previous: LastfmFormState, formData: FormData): Promise<LastfmFormState> {
  const userId = await requireUserId();
  const lastfmUser = String(formData.get("lastfmUser") ?? "").trim();
  if (!lastfmUser) return { error: "Enter your Last.fm username." };

  try {
    const run = await startLastfmImport(userId, lastfmUser);
    if (!run.progress.done) {
      after(async () => {
        const finished = await runLastfmImport(userId, run);
        if (finished.imported === 0) return;
        const covers = await startCoverSearch(userId);
        if (covers.total > 0) await findCoversAfterImport(userId, covers);
      });
    }
    revalidatePath("/import");
    return { lastfmUser, progress: run.progress };
  } catch (error) {
    if (error instanceof ImportError) return { lastfmUser, error: error.message };
    throw error;
  }
}

export async function lastfmProgress(): Promise<LastfmProgress | null> {
  return getLastfmProgress(await requireUserId());
}

export async function coverProgress(): Promise<CoverProgress | null> {
  return getCoverProgress(await requireUserId());
}

export type SpotifyBatchResult = { imported: number; skipped: number; error?: string };

const SPOTIFY_LOCK_SECONDS = 5 * 60;
const MAX_TEXT = 300;

function cleanListen(value: unknown) {
  const listen = value as Partial<SpotifyListen> | null;
  const artist = typeof listen?.artist === "string" ? listen.artist.trim().slice(0, MAX_TEXT) : "";
  const title = typeof listen?.title === "string" ? listen.title.trim().slice(0, MAX_TEXT) : "";
  const playedAt = Number(listen?.playedAt);
  if (!artist || !title || !Number.isFinite(playedAt)) return null;
  const album = typeof listen?.album === "string" ? listen.album.trim().slice(0, MAX_TEXT) : undefined;
  return { artist, title, playedAt: new Date(playedAt), album: album || undefined };
}

export async function importSpotifyBatch(batch: unknown): Promise<SpotifyBatchResult> {
  const userId = await requireUserId();
  if (!Array.isArray(batch) || batch.length > SPOTIFY_BATCH) {
    return { imported: 0, skipped: 0, error: "That batch of plays wasn't valid." };
  }
  if (!(await takeLock(keys.importLock(userId), SPOTIFY_LOCK_SECONDS))) {
    return { imported: 0, skipped: 0, error: "Another import is running for your account. Try again when it's done." };
  }
  try {
    const listens = batch.map(cleanListen).filter((listen) => listen !== null);
    const fresh = await withoutKnownPlays(userId, listens);
    const result = await importListens(userId, fresh);
    return { imported: result.imported, skipped: batch.length - result.imported };
  } finally {
    await deleteValues(keys.importLock(userId));
  }
}

export async function finishSpotifyImport() {
  const userId = await requireUserId();
  const progress = await startCoverSearch(userId);
  if (progress.total > 0) after(() => findCoversAfterImport(userId, progress));
  revalidatePath("/import");
}
