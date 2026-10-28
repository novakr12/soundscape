import { musicBrainz, Unreachable } from "./coverartarchive";
import { sql } from "./postgres";

const MAX_GENRES = 5;
const MIN_SHARE_OF_TOP = 0.1;
const RECORDINGS_TRIED = 3;
const RETRY_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

type Credit = { name?: string; artist?: { id: string; name: string } };
type Genre = { name: string; count?: number };

export type GenreSummary = { checked: number; found: number; unreachable: boolean };

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function pickGenres(genres: Genre[]): string[] {
  const sorted = [...genres].sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name));
  const top = sorted[0]?.count ?? 0;
  return sorted
    .filter((genre) => (genre.count ?? 0) >= Math.max(1, top * MIN_SHARE_OF_TOP))
    .slice(0, MAX_GENRES)
    .map((genre) => genre.name.toLowerCase());
}

async function artistFromRecordings(name: string, recordings: string[]): Promise<string | null> {
  for (const mbid of recordings.slice(0, RECORDINGS_TRIED)) {
    const recording = await musicBrainz<{ "artist-credit"?: Credit[] }>(`/recording/${mbid}`, {
      inc: "artist-credits",
    });
    const credits = recording?.["artist-credit"] ?? [];
    const credit = credits.find((c) => c.artist && normalize(c.artist.name) === normalize(name));
    if (credit?.artist) return credit.artist.id;
  }
  return null;
}

async function artistFromSearch(name: string): Promise<string | null> {
  const result = await musicBrainz<{
    artists?: { id: string; name: string; score?: number; aliases?: { name: string }[] }[];
  }>("/artist", { query: `artist:"${name.replace(/"/g, "")}"`, limit: "10" });
  const artists = result?.artists ?? [];
  const exact = artists.filter(
    (artist) =>
      normalize(artist.name) === normalize(name) ||
      (artist.aliases ?? []).some((alias) => normalize(alias.name) === normalize(name)),
  );
  return exact.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]?.id ?? null;
}

export async function findArtistGenres(name: string, recordings: string[] = []) {
  const mbid = (await artistFromRecordings(name, recordings)) ?? (await artistFromSearch(name));
  if (!mbid) return null;
  const artist = await musicBrainz<{ genres?: Genre[] }>(`/artist/${mbid}`, { inc: "genres" });
  return { mbid, genres: pickGenres(artist?.genres ?? []) };
}

const FILL_EVERY_MS = 60 * 60 * 1000;
const FILL_PER_RUN = 100;

const globalForGenres = globalThis as unknown as { genreFilling?: boolean };

export function startGenreFilling() {
  if (globalForGenres.genreFilling) return;
  globalForGenres.genreFilling = true;
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await fillGenres({ limit: FILL_PER_RUN });
    } catch (error) {
      console.warn(`Genres: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  }, FILL_EVERY_MS);
}

export async function fillGenres({
  limit = 50,
  userId,
  now = Date.now(),
}: {
  limit?: number;
  userId?: string;
  now?: number;
} = {}) {
  const rows = await sql`
    SELECT a.id, a.name, sum(p.plays) AS plays,
           coalesce(array_agg(DISTINCT t.mbid) FILTER (WHERE t.mbid IS NOT NULL), '{}') AS recordings
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE (a.genres_checked_at IS NULL
           OR (a.genres_checked_at < ${new Date(now - RETRY_AFTER_MS)}
               AND NOT EXISTS (SELECT 1 FROM artist_genres g WHERE g.artist_id = a.id)))
      ${userId ? sql`AND p.user_id = ${userId}` : sql``}
    GROUP BY a.id
    ORDER BY plays DESC, a.id
    LIMIT ${limit}`;

  const summary: GenreSummary = { checked: 0, found: 0, unreachable: false };
  for (const row of rows) {
    let match: Awaited<ReturnType<typeof findArtistGenres>>;
    try {
      match = await findArtistGenres(row.name, row.recordings);
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      summary.unreachable = true;
      break;
    }
    summary.checked++;
    if (match && match.genres.length > 0) summary.found++;
    const genres = [...new Set(match?.genres ?? [])];
    await sql.begin(async (transaction) => {
      await transaction`
        UPDATE artists SET genres_checked_at = ${new Date(now)}, mbid = coalesce(${match?.mbid ?? null}, mbid)
        WHERE id = ${row.id}`;
      if (genres.length > 0) {
        await transaction`
          INSERT INTO artist_genres (artist_id, genre)
          SELECT ${row.id}, genre FROM unnest(${genres}::text[]) AS genre
          ON CONFLICT DO NOTHING`;
      }
    });
  }
  return summary;
}
