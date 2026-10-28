import { withoutKnownPlays } from "./dedupe";
import { importListens, type Listen } from "./imports";
import { deleteValues, extendValue, getValue, keys, setValue, takeLock } from "./kv";
import { ImportError } from "./listenbrainz";
import { sql } from "./postgres";

const api = () => process.env.LASTFM_API_URL ?? "https://ws.audioscrobbler.com/2.0/";
const apiKey = () => process.env.LASTFM_API_KEY ?? "";
const requestGapMs = () => Number(process.env.LASTFM_REQUEST_GAP_MS ?? 250);

const SOURCE = "lastfm";
const PAGE_SIZE = 200;
const LOCK_SECONDS = 10 * 60;
const PROGRESS_SECONDS = 24 * 60 * 60;
const STALLED_MS = 3 * 60 * 1000;
const RETRIES = 4;

const RETRY_LATER = new Set([8, 11, 16, 29]);
const BAD_KEY = new Set([10, 26]);

type LastfmTrack = {
  name?: string;
  mbid?: string;
  artist?: { "#text"?: string };
  album?: { "#text"?: string };
  date?: { uts?: string };
  "@attr"?: { nowplaying?: string };
};

type LastfmPage = { tracks: LastfmTrack[]; pages: number; total: number };

export type LastfmProgress = {
  lastfmUser: string;
  done: boolean;
  pages: number;
  pagesDone: number;
  total: number;
  imported: number;
  skipped: number;
  updatedAt: number;
  error?: string;
};

export type LastfmState = { lastfmUser: string; listenedUpTo: Date };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function lastfmConfigured() {
  return apiKey() !== "";
}

async function fetchPage(lastfmUser: string, page: number, from?: number, to?: number): Promise<LastfmPage> {
  const query = new URLSearchParams({
    method: "user.getrecenttracks",
    user: lastfmUser,
    api_key: apiKey(),
    format: "json",
    limit: String(PAGE_SIZE),
    page: String(page),
  });
  if (from) query.set("from", String(from));
  if (to) query.set("to", String(to));

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    if (attempt > 0) await sleep(attempt * 20 * requestGapMs());
    let body: {
      error?: number;
      message?: string;
      recenttracks?: { track?: LastfmTrack | LastfmTrack[]; "@attr"?: { totalPages?: string; total?: string } };
    };
    try {
      const response = await fetch(`${api()}?${query}`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
      body = await response.json();
    } catch {
      continue;
    }
    if (body.error === 6) throw new ImportError(`No Last.fm user named ${lastfmUser}`);
    if (body.error === 17) throw new ImportError(`${lastfmUser} hides their listening history on Last.fm`);
    if (body.error && BAD_KEY.has(body.error)) {
      throw new ImportError("The Last.fm API key isn't valid. Check LASTFM_API_KEY in .env");
    }
    if (body.error && RETRY_LATER.has(body.error)) continue;
    if (body.error || !body.recenttracks) throw new ImportError(`Last.fm: ${body.message ?? "unexpected answer"}`);
    const track = body.recenttracks.track ?? [];
    return {
      tracks: Array.isArray(track) ? track : [track],
      pages: Number(body.recenttracks["@attr"]?.totalPages ?? 0),
      total: Number(body.recenttracks["@attr"]?.total ?? 0),
    };
  }
  throw new ImportError("Last.fm is unreachable or busy, try again later");
}

function toListens(tracks: LastfmTrack[]): Listen[] {
  return tracks
    .filter((track) => track.date?.uts && track["@attr"]?.nowplaying !== "true")
    .map((track) => ({
      artist: track.artist?.["#text"] ?? "",
      title: track.name ?? "",
      playedAt: new Date(Number(track.date!.uts) * 1000),
      mbid: track.mbid || undefined,
      album: track.album?.["#text"] || undefined,
    }));
}

export async function getLastfmState(userId: string): Promise<LastfmState | null> {
  const [row] = await sql`
    SELECT external_user, listened_up_to FROM import_state WHERE user_id = ${userId} AND source = ${SOURCE}`;
  return row ? { lastfmUser: row.external_user, listenedUpTo: row.listened_up_to } : null;
}

async function saveState(userId: string, lastfmUser: string, upTo: Date) {
  await sql`
    INSERT INTO import_state (user_id, source, external_user, listened_up_to)
    VALUES (${userId}, ${SOURCE}, ${lastfmUser}, ${upTo})
    ON CONFLICT (user_id, source) DO UPDATE SET external_user = excluded.external_user,
      listened_up_to = excluded.listened_up_to, imported_at = now()`;
}

async function saveProgress(userId: string, progress: LastfmProgress) {
  progress.updatedAt = Date.now();
  await setValue(keys.lastfmProgress(userId), progress, PROGRESS_SECONDS);
}

export async function getLastfmProgress(userId: string, now = Date.now()): Promise<LastfmProgress | null> {
  const progress = await getValue<LastfmProgress>(keys.lastfmProgress(userId));
  if (!progress) return null;
  if (!progress.done && now - progress.updatedAt > STALLED_MS) {
    return { ...progress, done: true, error: "The import stopped. Press Import again to continue where it left off." };
  }
  return progress;
}

export type LastfmRun = { progress: LastfmProgress; from?: number; to: number };

export async function startLastfmImport(userId: string, lastfmUser: string, now = new Date()): Promise<LastfmRun> {
  if (!lastfmConfigured()) throw new ImportError("Last.fm import isn't set up. Add LASTFM_API_KEY to .env");
  if (!(await takeLock(keys.importLock(userId), LOCK_SECONDS))) {
    throw new ImportError("An import is already running for your account");
  }

  try {
    const state = await getLastfmState(userId);
    const from =
      state?.lastfmUser.toLowerCase() === lastfmUser.toLowerCase()
        ? Math.floor(state.listenedUpTo.getTime() / 1000) + 1
        : undefined;
    const to = Math.floor(now.getTime() / 1000);
    const first = await fetchPage(lastfmUser, 1, from, to);
    const progress: LastfmProgress = {
      lastfmUser,
      done: first.total === 0,
      pages: first.pages,
      pagesDone: 0,
      total: first.total,
      imported: 0,
      skipped: 0,
      updatedAt: 0,
    };
    await saveProgress(userId, progress);
    if (progress.done) await deleteValues(keys.importLock(userId));
    return { progress, from, to };
  } catch (error) {
    await deleteValues(keys.importLock(userId));
    throw error;
  }
}

export async function runLastfmImport(userId: string, { progress, from, to }: LastfmRun) {
  try {
    for (let page = progress.pages; page >= 1; page--) {
      const { tracks } = await fetchPage(progress.lastfmUser, page, from, to);
      const listens = toListens(tracks);
      const fresh = await withoutKnownPlays(userId, listens);
      const result = await importListens(userId, fresh);
      progress.imported += result.imported;
      progress.skipped += listens.length - fresh.length + result.skipped;
      progress.pagesDone++;
      const newest = Math.max(...listens.map((listen) => listen.playedAt.getTime()));
      if (Number.isFinite(newest)) await saveState(userId, progress.lastfmUser, new Date(newest));
      await saveProgress(userId, progress);
      await extendValue(keys.importLock(userId), LOCK_SECONDS);
      await sleep(requestGapMs());
    }
    progress.done = true;
  } catch (error) {
    progress.done = true;
    progress.error =
      error instanceof ImportError
        ? `${error.message}. Press Import again to continue where it left off.`
        : "The import stopped unexpectedly. Press Import again to continue where it left off.";
  } finally {
    await saveProgress(userId, progress);
    await deleteValues(keys.importLock(userId));
  }
  return progress;
}
