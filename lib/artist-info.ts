import { musicBrainz, Unreachable, USER_AGENT } from "./coverartarchive";
import { every } from "./jobs";
import { sql } from "./postgres";

const RECHECK_MS = 90 * 24 * 60 * 60 * 1000;
const FILL_EVERY_MS = 60 * 60 * 1000;
const FILL_PER_RUN = 50;
const MAX_BIO = 1200;

const wikidataUrl = () => process.env.WIKIDATA_URL ?? "https://www.wikidata.org";
const wikipediaUrl = () => process.env.WIKIPEDIA_URL ?? "https://en.wikipedia.org";

const LINKS: { type: string; label: string; host?: string }[] = [
  { type: "official homepage", label: "Website" },
  { type: "bandcamp", label: "Bandcamp" },
  { type: "soundcloud", label: "SoundCloud" },
  { type: "youtube", label: "YouTube" },
  { type: "social network", label: "Instagram", host: "instagram.com" },
];

type Relation = { type: string; url?: { resource: string } };
type MusicBrainzArtist = {
  type?: string | null;
  area?: { name?: string } | null;
  "life-span"?: { begin?: string | null; end?: string | null; ended?: boolean };
  relations?: Relation[];
};

export type ArtistLink = { label: string; url: string };

export type ArtistInfo = {
  type?: string;
  area?: string;
  began?: string;
  ended?: string;
  hasEnded: boolean;
  bio?: string;
  bioUrl?: string;
  links: ArtistLink[];
};

export type InfoSummary = { checked: number; withBio: number; unreachable: boolean; reason?: string };

function webUrl(text: string) {
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function getJson<T>(url: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new Unreachable(`${new URL(url).host} is unreachable`);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Unreachable(`${new URL(url).host} answered with ${response.status}`);
  return response.json() as Promise<T>;
}

async function wikipediaSummary(wikidataId: string) {
  const entity = await getJson<{ entities?: Record<string, { sitelinks?: { enwiki?: { title: string } } }> }>(
    `${wikidataUrl()}/wiki/Special:EntityData/${encodeURIComponent(wikidataId)}.json`,
  );
  const title = Object.values(entity?.entities ?? {})[0]?.sitelinks?.enwiki?.title;
  if (!title) return null;
  const page = await getJson<{ type?: string; extract?: string; content_urls?: { desktop?: { page?: string } } }>(
    `${wikipediaUrl()}/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
  );
  const extract = page?.extract?.trim();
  if (!extract || page?.type === "disambiguation") return null;
  const bio = extract.length > MAX_BIO ? `${extract.slice(0, MAX_BIO).replace(/\s+\S*$/, "")}…` : extract;
  return { bio, url: webUrl(page?.content_urls?.desktop?.page ?? "") ?? undefined };
}

export async function findArtistInfo(mbid: string): Promise<ArtistInfo | null> {
  const artist = await musicBrainz<MusicBrainzArtist>(`/artist/${mbid}`, { inc: "url-rels" });
  if (!artist) return null;
  const relations = artist.relations ?? [];
  const links: ArtistLink[] = [];
  for (const { type, label, host } of LINKS) {
    const match = relations.find(
      (relation) => relation.type === type && (!host || relation.url?.resource.includes(host)),
    );
    const url = webUrl(match?.url?.resource ?? "");
    if (url) links.push({ label, url });
  }
  links.push({ label: "MusicBrainz", url: `https://musicbrainz.org/artist/${mbid}` });

  const wikidata = relations
    .find((relation) => relation.type === "wikidata")
    ?.url?.resource.split("/")
    .pop();
  const summary = wikidata ? await wikipediaSummary(wikidata) : null;
  const span = artist["life-span"] ?? {};
  return {
    ...(artist.type ? { type: artist.type } : {}),
    ...(artist.area?.name ? { area: artist.area.name } : {}),
    ...(span.begin ? { began: span.begin.slice(0, 4) } : {}),
    ...(span.end ? { ended: span.end.slice(0, 4) } : {}),
    hasEnded: Boolean(span.ended),
    ...(summary ? { bio: summary.bio, ...(summary.url ? { bioUrl: summary.url } : {}) } : {}),
    links,
  };
}

async function saveInfo(artistId: string, info: ArtistInfo | null, now: number) {
  await sql`
    UPDATE artists SET
      artist_type = ${info?.type ?? null}, area = ${info?.area ?? null}, began = ${info?.began ?? null},
      ended = ${info?.ended ?? null}, has_ended = ${info?.hasEnded ?? false}, bio = ${info?.bio ?? null},
      bio_url = ${info?.bioUrl ?? null}, links = ${sql.json(info?.links ?? [])}, info_checked_at = ${new Date(now)}
    WHERE id = ${artistId}`;
}

export async function fillArtistInfo({
  limit = 25,
  userId,
  now = Date.now(),
}: {
  limit?: number;
  userId?: string;
  now?: number;
} = {}) {
  const rows = await sql`
    SELECT a.id, a.mbid, sum(p.plays) AS plays
    FROM user_track_plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE a.mbid IS NOT NULL
      AND (a.info_checked_at IS NULL OR a.info_checked_at < ${new Date(now - RECHECK_MS)})
      ${userId ? sql`AND p.user_id = ${userId}` : sql``}
    GROUP BY a.id
    ORDER BY plays DESC, a.id
    LIMIT ${limit}`;
  const summary: InfoSummary = { checked: 0, withBio: 0, unreachable: false };
  for (const row of rows) {
    let info: ArtistInfo | null;
    try {
      info = await findArtistInfo(row.mbid);
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      summary.unreachable = true;
      summary.reason = error.message;
      break;
    }
    summary.checked++;
    if (info?.bio) summary.withBio++;
    await saveInfo(row.id, info, now);
  }
  return summary;
}

export async function ensureArtistInfo(artistId: string, now = Date.now()) {
  const [row] = await sql`SELECT mbid, info_checked_at FROM artists WHERE id = ${artistId}`;
  if (!row?.mbid || (row.info_checked_at && now - row.info_checked_at.getTime() < RECHECK_MS)) return;
  try {
    await saveInfo(artistId, await findArtistInfo(row.mbid), now);
  } catch (error) {
    if (!(error instanceof Unreachable)) throw error;
  }
}

export function startArtistInfoFilling() {
  every("artist-info", FILL_EVERY_MS, async () => {
    const { checked, withBio, unreachable, reason } = await fillArtistInfo({ limit: FILL_PER_RUN });
    return { checked, found: withBio, unreachable, reason };
  });
}
