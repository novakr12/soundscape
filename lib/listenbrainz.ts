import { linkAlbums, trackNumber } from "./albums";
import { trackIdFor } from "./catalog";
import { type ImportResult, importListens, type Listen } from "./imports";
import { deleteValues, keys, takeLock } from "./kv";
import { sql } from "./postgres";

const api = () => process.env.LISTENBRAINZ_API_URL ?? "https://api.listenbrainz.org/1";
const SOURCE = "listenbrainz";
const PAGE_SIZE = 1000;
const LOCK_SECONDS = 10 * 60;
export const MAX_LISTENS_PER_IMPORT = 5000;

type ListenBrainzListen = {
  listened_at: number;
  track_metadata: {
    artist_name: string;
    track_name: string;
    release_name?: string;
    additional_info?: { recording_mbid?: string; duration_ms?: number; tracknumber?: string | number };
    mbid_mapping?: { recording_mbid?: string };
  };
};

export type ImportState = {
  externalUser: string;
  listenedUpTo: Date;
  importedAt: Date;
};

export type ListenBrainzResult = ImportResult & { truncated: boolean };

export class ImportError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(listenBrainzUser: string, maxTs?: number): Promise<ListenBrainzListen[]> {
  const query = new URLSearchParams({ count: String(PAGE_SIZE) });
  if (maxTs) query.set("max_ts", String(maxTs));
  const url = `${api()}/user/${encodeURIComponent(listenBrainzUser)}/listens?${query}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    } catch {
      throw new ImportError("ListenBrainz is unreachable, try again later");
    }
    if (response.status === 404) throw new ImportError(`No ListenBrainz user named ${listenBrainzUser}`);
    if (response.status === 429) {
      await sleep((Number(response.headers.get("x-ratelimit-reset-in") ?? 5) + 1) * 1000);
      continue;
    }
    if (!response.ok) throw new ImportError(`ListenBrainz answered ${response.status}, try again later`);
    const body = (await response.json()) as { payload: { listens: ListenBrainzListen[] } };
    return body.payload.listens;
  }
  throw new ImportError("ListenBrainz is rate limiting us, try again in a minute");
}

async function fetchNewListens(listenBrainzUser: string, since: Date | null) {
  const sinceTs = since ? Math.floor(since.getTime() / 1000) : 0;
  const listens: ListenBrainzListen[] = [];
  let maxTs: number | undefined;

  while (listens.length < MAX_LISTENS_PER_IMPORT) {
    const page = await fetchPage(listenBrainzUser, maxTs);
    const fresh = page.filter((listen) => listen.listened_at > sinceTs);
    listens.push(...fresh);
    if (page.length < PAGE_SIZE || fresh.length < page.length) {
      return { listens, truncated: false };
    }
    maxTs = page[page.length - 1].listened_at;
  }

  return { listens: listens.slice(0, MAX_LISTENS_PER_IMPORT), truncated: true };
}

export async function albumsFromListenBrainz(listenBrainzUser: string): Promise<{ listens: number; linked: number }> {
  let listens = 0;
  let linked = 0;
  let maxTs: number | undefined;
  for (;;) {
    const page = await fetchPage(listenBrainzUser, maxTs);
    listens += page.length;
    linked += await linkAlbums(
      page.flatMap((listen) =>
        listen.track_metadata.release_name
          ? [
              {
                trackId: trackIdFor(listen.track_metadata.artist_name ?? "", listen.track_metadata.track_name ?? ""),
                album: listen.track_metadata.release_name,
                number: trackNumber(listen.track_metadata.additional_info?.tracknumber),
              },
            ]
          : [],
      ),
    );
    if (page.length < PAGE_SIZE) return { listens, linked };
    maxTs = page[page.length - 1].listened_at;
  }
}

export async function listenBrainzAccounts(): Promise<{ userId: string; listenBrainzUser: string }[]> {
  const rows = await sql`SELECT user_id, external_user FROM import_state WHERE source = ${SOURCE} ORDER BY user_id`;
  return rows.map((row) => ({ userId: row.user_id, listenBrainzUser: row.external_user }));
}

export async function getImportState(userId: string): Promise<ImportState | null> {
  const [row] = await sql`
    SELECT external_user, listened_up_to, imported_at FROM import_state WHERE user_id = ${userId} AND source = ${SOURCE}`;
  return row
    ? { externalUser: row.external_user, listenedUpTo: row.listened_up_to, importedAt: row.imported_at }
    : null;
}

async function saveImportState(userId: string, listenBrainzUser: string, upTo: Date, importedAt: Date) {
  await sql`
    INSERT INTO import_state (user_id, source, external_user, listened_up_to, imported_at)
    VALUES (${userId}, ${SOURCE}, ${listenBrainzUser}, ${upTo}, ${importedAt})
    ON CONFLICT (user_id, source) DO UPDATE SET external_user = excluded.external_user,
      listened_up_to = excluded.listened_up_to, imported_at = excluded.imported_at`;
}

export async function importFromListenBrainz(userId: string, listenBrainzUser: string): Promise<ListenBrainzResult> {
  if (!(await takeLock(keys.importLock(userId), LOCK_SECONDS))) {
    throw new ImportError("An import is already running for your account");
  }

  try {
    const state = await getImportState(userId);
    const since = state?.externalUser === listenBrainzUser ? state.listenedUpTo : null;
    const { listens, truncated } = await fetchNewListens(listenBrainzUser, since);

    const mapped: Listen[] = listens.map((listen) => ({
      artist: listen.track_metadata.artist_name ?? "",
      title: listen.track_metadata.track_name ?? "",
      playedAt: new Date(listen.listened_at * 1000),
      mbid: listen.track_metadata.mbid_mapping?.recording_mbid ?? listen.track_metadata.additional_info?.recording_mbid,
      durationMs: listen.track_metadata.additional_info?.duration_ms,
      album: listen.track_metadata.release_name,
      trackNumber: trackNumber(listen.track_metadata.additional_info?.tracknumber),
    }));
    const result = await importListens(userId, mapped);

    if (listens.length > 0) {
      await saveImportState(userId, listenBrainzUser, new Date(listens[0].listened_at * 1000), new Date());
    }

    return { ...result, truncated };
  } finally {
    await deleteValues(keys.importLock(userId));
  }
}

export async function advanceImportState(userId: string, listenBrainzUser: string, upTo: Date) {
  const state = await getImportState(userId);
  if (state && (state.externalUser !== listenBrainzUser || state.listenedUpTo >= upTo)) return;
  await saveImportState(userId, listenBrainzUser, upTo, state?.importedAt ?? new Date());
}
