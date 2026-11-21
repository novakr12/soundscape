import { artistIdFor, mainArtist, slug, songTitle } from "./catalog";
import { request } from "./http";
import { sql } from "./postgres";

const RETRY_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const RELEASE_GROUPS_TRIED = 5;

type ReleaseGroup = { id: string; "primary-type"?: string; "secondary-types"?: string[] };
type Release = { id: string; status?: string; date?: string; "release-group"?: ReleaseGroup };
type Recording = {
  id: string;
  title: string;
  length?: number;
  "artist-credit"?: { name: string }[];
  releases?: Release[];
};

export type CoverArtMatch = { cover: string; releaseGroup: string; durationMs?: number };

export type CoverArtSummary = { checked: number; found: number; unreachable: boolean };

export class Unreachable extends Error {}

const musicBrainzUrl = () => process.env.MUSICBRAINZ_URL ?? "https://musicbrainz.org/ws/2";
const coverArtArchiveUrl = () => process.env.COVER_ART_ARCHIVE_URL ?? "https://coverartarchive.org";
const requestGapMs = () => Number(process.env.MUSICBRAINZ_REQUEST_GAP_MS ?? 1100);

const globalForMusicBrainz = globalThis as unknown as {
  soundscapeMbNextAt?: number;
  soundscapeCaaFilling?: boolean;
};

const BUSY_RETRIES = 4;

export async function musicBrainz<T>(path: string, params: Record<string, string>, attempt = 0): Promise<T | null> {
  const now = Date.now();
  const nextAt = globalForMusicBrainz.soundscapeMbNextAt ?? 0;
  const wait = Math.max(0, nextAt - now);
  globalForMusicBrainz.soundscapeMbNextAt = Math.max(now, nextAt) + requestGapMs();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

  let response: Response;
  try {
    response = await request(`${musicBrainzUrl()}${path}?${new URLSearchParams({ ...params, fmt: "json" })}`, {
      headers: { accept: "application/json" },
      timeoutMs: 10_000,
    });
  } catch {
    throw new Unreachable("MusicBrainz is unreachable");
  }
  if (response.status === 404) return null;
  if (response.status === 503 && attempt < BUSY_RETRIES) {
    await new Promise((resolve) => setTimeout(resolve, 3 * 2 ** attempt * requestGapMs()));
    return musicBrainz<T>(path, params, attempt + 1);
  }
  if (!response.ok) throw new Unreachable(`MusicBrainz answered with ${response.status}`);
  return response.json();
}

async function hasFrontCover(releaseGroup: string) {
  let response: Response;
  try {
    response = await request(`${coverArtArchiveUrl()}/release-group/${releaseGroup}/front-250`, {
      method: "HEAD",
      redirect: "manual",
      timeoutMs: 10_000,
    });
  } catch {
    throw new Unreachable("The Cover Art Archive is unreachable");
  }
  if (response.status >= 500) throw new Unreachable(`The Cover Art Archive answered with ${response.status}`);
  return response.ok || (response.status >= 300 && response.status < 400);
}

const quote = (text: string) => `"${text.replace(/["\\]/g, " ")}"`;

function isSameRecording(recording: Recording, artist: string, title: string) {
  if (slug(songTitle(recording.title)) !== slug(songTitle(title))) return false;
  const credited = recording["artist-credit"]?.[0]?.name;
  if (!credited) return false;
  const wanted = new Set([artistIdFor(artist), artistIdFor(mainArtist(artist))]);
  return wanted.has(artistIdFor(credited)) || wanted.has(artistIdFor(mainArtist(credited)));
}

function releaseRank(release: Release) {
  const group = release["release-group"];
  const type = group?.["primary-type"];
  return (
    (release.status === "Official" ? 0 : 100) +
    (group?.["secondary-types"]?.length ? 10 : 0) +
    (type === "Album" ? 0 : type === "EP" || type === "Single" ? 1 : 2)
  );
}

function releaseGroupsByPreference(recordings: Recording[]) {
  const releases = recordings
    .flatMap((recording) => recording.releases ?? [])
    .filter((release) => release["release-group"]?.id)
    .sort((a, b) => releaseRank(a) - releaseRank(b) || (a.date || "9999").localeCompare(b.date || "9999"));
  return [...new Set(releases.map((release) => release["release-group"]!.id))];
}

async function recordingsFor(artist: string, title: string, mbid?: string | null): Promise<Recording[]> {
  if (mbid) {
    const recording = await musicBrainz<Recording>(`/recording/${mbid}`, {
      inc: "artist-credits releases release-groups",
    });
    if (recording) return [recording];
  }
  const query = `recording:${quote(songTitle(title))} AND artist:${quote(mainArtist(artist))}`;
  for (const search of [`${query} AND status:official`, query]) {
    const body = await musicBrainz<{ recordings?: Recording[] }>("/recording", { query: search, limit: "100" });
    const recordings = (body?.recordings ?? []).filter((r) => isSameRecording(r, artist, title));
    if (recordings.length > 0) return recordings;
  }
  return [];
}

async function findCoverArt(artist: string, title: string, mbid?: string | null): Promise<CoverArtMatch | null> {
  const recordings = await recordingsFor(artist, title, mbid);
  for (const releaseGroup of releaseGroupsByPreference(recordings).slice(0, RELEASE_GROUPS_TRIED)) {
    if (!(await hasFrontCover(releaseGroup))) continue;
    const recording =
      recordings.find((r) => r.releases?.some((release) => release["release-group"]?.id === releaseGroup)) ??
      recordings[0];
    return {
      cover: `${coverArtArchiveUrl()}/release-group/${releaseGroup}/front-250`,
      releaseGroup,
      durationMs: recording.length ?? undefined,
    };
  }
  return null;
}

type FillOptions = { userId?: string; limit?: number; now?: number };

export async function fillCoversFromCoverArtArchive(options: FillOptions = {}): Promise<CoverArtSummary> {
  const { userId, limit = 25, now = Date.now() } = options;
  const summary = { checked: 0, found: 0, unreachable: false };
  if (globalForMusicBrainz.soundscapeCaaFilling) return summary;
  globalForMusicBrainz.soundscapeCaaFilling = true;
  try {
    const listened = userId
      ? sql`AND EXISTS (SELECT 1 FROM user_track_plays p WHERE p.track_id = t.id AND p.user_id = ${userId})`
      : sql``;
    const rows = await sql`
      SELECT t.id, t.title, a.name AS artist, t.mbid
      FROM tracks t JOIN artists a ON a.id = t.artist_id
      WHERE t.cover IS NULL AND t.deezer_missing
        AND (t.cover_art_checked_at IS NULL OR t.cover_art_checked_at < ${new Date(now - RETRY_AFTER_MS)}) ${listened}
      ORDER BY t.id
      LIMIT ${limit}`;

    for (const row of rows) {
      const trackId: string = row.id;
      let match: CoverArtMatch | null;
      try {
        match = await findCoverArt(row.artist, row.title, row.mbid);
      } catch (error) {
        if (!(error instanceof Unreachable)) throw error;
        summary.unreachable = true;
        break;
      }
      summary.checked++;
      if (match) {
        await sql`
          UPDATE tracks SET cover = ${match.cover}, cover_art_release_group = ${match.releaseGroup},
                            duration_ms = coalesce(duration_ms, ${match.durationMs ?? null}::int),
                            cover_art_checked_at = NULL
          WHERE id = ${trackId}`;
        summary.found++;
      } else {
        await sql`UPDATE tracks SET cover_art_checked_at = ${new Date(now)} WHERE id = ${trackId}`;
      }
    }
    return summary;
  } finally {
    globalForMusicBrainz.soundscapeCaaFilling = false;
  }
}
