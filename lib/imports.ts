import { linkAlbums } from "./albums";
import { slug, songArtist, songTitle, trackIdFor } from "./catalog";
import { deleteValues, keys } from "./kv";
import { sql } from "./postgres";

export type Listen = {
  artist: string;
  title: string;
  playedAt: Date;
  mbid?: string;
  durationMs?: number;
  album?: string;
  trackNumber?: number;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  catalogNodesCreated: number;
};

const PLAYS_PER_INSERT = 5000;
const MAX_TEXT = 300;
const ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type NewTrack = {
  trackId: string;
  title: string;
  artistId: string;
  artist: string;
  mbid?: string | null;
  durationMs?: number | null;
};

export async function saveTracks(tracks: NewTrack[]) {
  const artists = new Map(tracks.map((track) => [track.artistId, track.artist]));
  const newArtists = await sql`
    INSERT INTO artists (id, name)
    SELECT * FROM unnest(${[...artists.keys()]}::text[], ${[...artists.values()]}::text[])
    ON CONFLICT (id) DO NOTHING
    RETURNING id`;
  const saved = await sql`
    INSERT INTO tracks (id, title, artist_id, mbid, duration_ms)
    SELECT * FROM unnest(
      ${tracks.map((track) => track.trackId)}::text[],
      ${tracks.map((track) => track.title)}::text[],
      ${tracks.map((track) => track.artistId)}::text[],
      ${tracks.map((track) => track.mbid ?? null)}::text[],
      ${tracks.map((track) => track.durationMs ?? null)}::int[]
    )
    ON CONFLICT (id) DO UPDATE SET
      mbid = coalesce(tracks.mbid, excluded.mbid),
      duration_ms = coalesce(tracks.duration_ms, excluded.duration_ms)
    RETURNING id, xmax = 0 AS created`;
  return newArtists.length + saved.filter((row) => row.created).length;
}

function isValid(listen: Listen, now: Date) {
  return (
    listen.artist.trim() !== "" &&
    listen.title.trim() !== "" &&
    !Number.isNaN(listen.playedAt.getTime()) &&
    listen.playedAt.getTime() <= now.getTime() + ALLOWED_CLOCK_SKEW_MS
  );
}

export async function importListens(userId: string, listens: Listen[]): Promise<ImportResult> {
  const now = new Date();
  const valid = listens
    .map((listen) => ({ ...listen, artist: listen.artist.slice(0, MAX_TEXT), title: listen.title.slice(0, MAX_TEXT) }))
    .filter((listen) => isValid(listen, now));
  const skipped = listens.length - valid.length;
  if (valid.length === 0) return { imported: 0, skipped, catalogNodesCreated: 0 };

  const uniqueTracks = new Map<string, NewTrack>();
  for (const l of valid) {
    const trackId = trackIdFor(l.artist, l.title);
    const seen = uniqueTracks.get(trackId);
    uniqueTracks.set(trackId, {
      trackId,
      title: songTitle(l.title),
      artistId: slug(songArtist(l.artist)),
      artist: songArtist(l.artist),
      mbid: seen?.mbid ?? l.mbid ?? null,
      durationMs: seen?.durationMs ?? (l.durationMs ? Math.round(l.durationMs) : null),
    });
  }
  const created = await saveTracks([...uniqueTracks.values()]);

  await linkAlbums(
    valid.flatMap((listen) =>
      listen.album
        ? [{ trackId: trackIdFor(listen.artist, listen.title), album: listen.album, number: listen.trackNumber }]
        : [],
    ),
  );

  const plays = valid.map((listen) => ({
    trackId: trackIdFor(listen.artist, listen.title),
    playedAt: listen.playedAt,
  }));

  for (let i = 0; i < plays.length; i += PLAYS_PER_INSERT) {
    const batch = plays.slice(i, i + PLAYS_PER_INSERT);
    await sql`
      INSERT INTO plays (id, user_id, track_id, played_at)
      SELECT gen_random_uuid(), ${userId}, track_id, played_at
      FROM unnest(${batch.map((play) => play.trackId)}::text[], ${batch.map((play) => play.playedAt.toISOString())}::timestamptz[])
        AS play(track_id, played_at)`;
  }

  await deleteValues(keys.listeningRecord(userId));

  return { imported: plays.length, skipped, catalogNodesCreated: created };
}
