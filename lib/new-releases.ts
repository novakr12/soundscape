import { musicBrainz, Unreachable } from "./coverartarchive";
import { every } from "./jobs";
import { notifyRelease } from "./notifications";
import { sql } from "./postgres";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const RECHECK_AFTER_DAYS = 7;
const NEW_FOR_DAYS = 30;
const SHOWN_FOR_DAYS = 90;
const ARTISTS_PER_RUN = 60;
const TOP_ARTISTS = 30;
const KINDS = new Set(["Album", "EP"]);
const LEFT_OUT = new Set(["Compilation", "Live", "Remix", "DJ-mix", "Demo", "Interview", "Spokenword"]);

export type FoundRelease = { mbid: string; title: string; kind: string; released: string };
export type NewRelease = FoundRelease & { artistId: string; artist: string };

type ReleaseGroup = {
  id?: string;
  title?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "first-release-date"?: string;
};

function day(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function recentReleases(groups: ReleaseGroup[], now: Date, days = NEW_FOR_DAYS): FoundRelease[] {
  const since = day(new Date(now.getTime() - days * 86_400_000));
  const today = day(now);
  return groups.flatMap((group) => {
    const released = group["first-release-date"] ?? "";
    const kind = group["primary-type"] ?? "";
    if (!group.id || !group.title || !/^\d{4}-\d{2}-\d{2}$/.test(released)) return [];
    if (released < since || released > today || !KINDS.has(kind)) return [];
    if ((group["secondary-types"] ?? []).some((type) => LEFT_OUT.has(type))) return [];
    return [{ mbid: group.id, title: group.title, kind, released }];
  });
}

async function artistsToCheck(only?: string[]) {
  return sql`
    WITH ranked AS (
      SELECT p.user_id, t.artist_id, row_number() OVER (PARTITION BY p.user_id ORDER BY sum(p.plays) DESC) AS rank
      FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
      GROUP BY p.user_id, t.artist_id
    )
    SELECT DISTINCT a.id, a.name, a.mbid, a.releases_checked_at
    FROM ranked r JOIN artists a ON a.id = r.artist_id
    WHERE r.rank <= ${TOP_ARTISTS} AND a.mbid IS NOT NULL ${only ? sql`AND a.id = ANY(${only})` : sql``}
      AND (a.releases_checked_at IS NULL OR a.releases_checked_at < now() - make_interval(days => ${RECHECK_AFTER_DAYS}))
    ORDER BY a.releases_checked_at NULLS FIRST
    LIMIT ${ARTISTS_PER_RUN}`;
}

async function listenersOf(artistId: string) {
  const rows = await sql`
    WITH ranked AS (
      SELECT p.user_id, t.artist_id, row_number() OVER (PARTITION BY p.user_id ORDER BY sum(p.plays) DESC) AS rank
      FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
      GROUP BY p.user_id, t.artist_id
    )
    SELECT user_id FROM ranked WHERE artist_id = ${artistId} AND rank <= ${TOP_ARTISTS}`;
  return rows.map((row) => row.user_id as string);
}

export async function checkNewReleases(now = new Date(), only?: string[]) {
  const artists = await artistsToCheck(only);
  let found = 0;
  let checked = 0;
  for (const artist of artists) {
    let groups: ReleaseGroup[];
    try {
      const since = day(new Date(now.getTime() - NEW_FOR_DAYS * 86_400_000));
      const answer = await musicBrainz<{ "release-groups"?: ReleaseGroup[] }>("/release-group", {
        query: `arid:${artist.mbid} AND firstreleasedate:[${since} TO ${day(now)}]`,
        limit: "50",
      });
      groups = answer?.["release-groups"] ?? [];
    } catch (error) {
      if (error instanceof Unreachable) return { checked, found, unreachable: true, reason: error.message };
      throw error;
    }
    for (const release of recentReleases(groups, now)) {
      const [saved] = await sql`
        INSERT INTO new_releases (mbid, artist_id, title, kind, released)
        VALUES (${release.mbid}, ${artist.id}, ${release.title}, ${release.kind}, ${release.released})
        ON CONFLICT (mbid) DO NOTHING
        RETURNING mbid`;
      if (!saved) continue;
      found++;
      for (const userId of await listenersOf(artist.id)) {
        await notifyRelease(userId, { artistId: artist.id, artist: artist.name, ...release });
      }
    }
    await sql`UPDATE artists SET releases_checked_at = ${now} WHERE id = ${artist.id}`;
    checked++;
  }
  return { checked: artists.length, found };
}

export async function newReleasesFor(userId: string, limit = 12): Promise<NewRelease[]> {
  const rows = await sql`
    WITH mine AS (
      SELECT t.artist_id FROM user_track_plays p JOIN tracks t ON t.id = p.track_id
      WHERE p.user_id = ${userId}
      GROUP BY t.artist_id ORDER BY sum(p.plays) DESC LIMIT ${TOP_ARTISTS}
    )
    SELECT r.mbid, r.title, r.kind, to_char(r.released, 'YYYY-MM-DD') AS released, a.id AS artist_id, a.name
    FROM new_releases r JOIN mine m ON m.artist_id = r.artist_id JOIN artists a ON a.id = r.artist_id
    WHERE r.released > now() - make_interval(days => ${SHOWN_FOR_DAYS})
    ORDER BY r.released DESC, r.title
    LIMIT ${limit}`;
  return rows.map((row) => ({
    mbid: row.mbid,
    title: row.title,
    kind: row.kind,
    released: row.released,
    artistId: row.artist_id,
    artist: row.name,
  }));
}

export function startNewReleaseChecks() {
  every("new-releases", CHECK_EVERY_MS, () => checkNewReleases());
}
