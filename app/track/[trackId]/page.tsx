import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AutoPlay from "@/components/auto-play";
import Cover from "@/components/cover";
import { SongTools } from "@/components/library-tools";
import LoveButton from "@/components/love-button";
import { ArtistLink } from "@/components/music-links";
import PlayButton from "@/components/play-button";
import RadioButton from "@/components/radio-button";
import { DailyPlaysChart } from "@/components/stats-charts";
import { isAdmin } from "@/lib/admin";
import { albumOf } from "@/lib/albums";
import { artistAlias, resolveTracks, trackAlias } from "@/lib/aliases";
import { getArtist } from "@/lib/artists";
import { artistIdFor } from "@/lib/catalog";
import { otherSongsBy } from "@/lib/library-edits";
import { isLoved } from "@/lib/loved";
import { albumKey, navidromeCover } from "@/lib/music";
import { getNavidrome, isSongId } from "@/lib/navidrome";
import { getSong } from "@/lib/navidrome-library";
import { sql } from "@/lib/postgres";
import { routeParam } from "@/lib/route-param";
import { currentUserId } from "@/lib/session";
import { getAlsoPlayed, getTrack, getTrackPlaysPerDay, getYourPlays } from "@/lib/tracks";

type Props = { params: Promise<{ trackId: string }>; searchParams?: Promise<{ play?: string; song?: string }> };

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

function duration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

async function navidromeTrackFallback(viewer: string | null, songParam: string | undefined) {
  if (!viewer || !songParam || !isSongId(songParam)) return null;
  const server = await getNavidrome(viewer);
  if (!server) return null;
  const song = await getSong(server, songParam).catch(() => null);
  if (!song) return null;
  const [resolved] = await resolveTracks([song]);
  return { song, resolved };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const track = await getTrack(routeParam((await params).trackId));
  if (track) return { title: `${track.title} · ${track.artist} · Soundscape` };
  const [viewer, query] = await Promise.all([currentUserId(), searchParams ?? Promise.resolve(undefined)]);
  const fallback = await navidromeTrackFallback(viewer, query?.song);
  return { title: fallback ? `${fallback.song.title} · ${fallback.song.artist} · Soundscape` : "Soundscape" };
}

export default async function TrackPage({ params, searchParams }: Props) {
  const trackId = routeParam((await params).trackId);
  const resolvedParams = searchParams ? await searchParams : undefined;
  const autoplay = resolvedParams?.play === "1";
  const [track, viewer] = await Promise.all([getTrack(trackId), currentUserId()]);
  if (!track) {
    const target = await trackAlias(trackId);
    if (target) redirect(`/track/${encodeURIComponent(target)}`);
    const fallback = await navidromeTrackFallback(viewer, resolvedParams?.song);
    if (!fallback) notFound();
    const { song, resolved } = fallback;
    if (await getTrack(resolved.trackId)) redirect(`/track/${encodeURIComponent(resolved.trackId)}`);

    const [knownArtist, aliasedArtist] = await Promise.all([
      getArtist(resolved.artistId),
      artistAlias(resolved.artistId),
    ]);
    const fallbackArtistId = resolved.artistId || artistIdFor(song.artist);
    const artistHref = knownArtist
      ? `/artist/${encodeURIComponent(resolved.artistId)}`
      : aliasedArtist
        ? `/artist/${encodeURIComponent(aliasedArtist)}`
        : fallbackArtistId
          ? `/artist/${encodeURIComponent(fallbackArtistId)}?name=${encodeURIComponent(song.artist)}`
          : `/music?q=${encodeURIComponent(song.artist)}`;

    const candidateAlbumId = song.album ? albumKey(resolved.artistId, song.album) : null;
    const knownAlbumRow = candidateAlbumId
      ? (await sql`SELECT id FROM albums WHERE id = ${candidateAlbumId}`)[0]
      : null;
    const albumHref =
      knownAlbumRow && candidateAlbumId
        ? `/album/${encodeURIComponent(candidateAlbumId)}`
        : song.albumId
          ? `/music?album=${encodeURIComponent(song.albumId)}`
          : undefined;

    const cover = navidromeCover(song.coverArt);
    const durationMs = song.duration ? Math.round(song.duration * 1000) : undefined;
    const playerTrack = {
      trackId: resolved.trackId,
      title: song.title,
      artist: song.artist,
      ...(cover ? { cover } : {}),
      ...(song.album ? { album: song.album } : {}),
      ...(albumHref ? { albumHref } : {}),
      artistHref,
      songId: song.id,
      ...(song.gain ? { gain: song.gain } : {}),
      ...(song.duration ? { duration: song.duration } : {}),
      newSong: true,
    };

    return (
      <>
        <div className="song-header">
          <Cover src={cover} large />
          <div>
            <p className="muted">Song</p>
            <h1>{song.title}</h1>
            <p>
              <Link href={artistHref} prefetch={false}>
                {song.artist}
              </Link>
              {song.album && (
                <>
                  <span className="muted"> · </span>
                  {albumHref ? (
                    <Link href={albumHref} prefetch={false}>
                      {song.album}
                    </Link>
                  ) : (
                    song.album
                  )}
                </>
              )}
              {durationMs && <span className="muted"> · {duration(durationMs)}</span>}
            </p>
            {autoplay && <AutoPlay track={playerTrack} />}
            <div className="export-buttons">
              <PlayButton track={playerTrack} />
            </div>
          </div>
        </div>

        <div className="tiles">
          <div className="tile">
            <span className="muted">Plays</span>
            <strong>0</strong>
          </div>
          <div className="tile">
            <span className="muted">Listeners</span>
            <strong>0</strong>
          </div>
          <div className="tile">
            <span className="muted">Your plays</span>
            <strong>0</strong>
          </div>
        </div>

        <p className="muted">Not played yet · in your Navidrome.</p>
      </>
    );
  }

  const admin = isAdmin(viewer);
  const [daily, yourPlays, alsoPlayed, album, otherSongs, loved] = await Promise.all([
    getTrackPlaysPerDay(trackId),
    viewer ? getYourPlays(viewer, trackId) : null,
    getAlsoPlayed(trackId),
    albumOf(trackId),
    admin ? otherSongsBy(trackId) : [],
    viewer ? isLoved(viewer, trackId) : false,
  ]);
  const navidrome = viewer ? await getNavidrome(viewer) : null;
  const last30 = daily.reduce((sum, d) => sum + d.plays, 0);

  const tiles = [
    { label: "Plays", value: track.plays },
    { label: "Listeners", value: track.listeners },
    ...(yourPlays === null ? [] : [{ label: "Your plays", value: yourPlays }]),
  ];

  return (
    <>
      <div className="song-header">
        <Cover src={track.cover} large />
        <div>
          <p className="muted">Song</p>
          <h1>{track.title}</h1>
          <p>
            <Link href={`/artist/${encodeURIComponent(track.artistId)}`}>{track.artist}</Link>
            {album && (
              <>
                <span className="muted"> · </span>
                <Link href={`/album/${encodeURIComponent(album.albumId)}`}>{album.title}</Link>
              </>
            )}
            {track.durationMs && <span className="muted"> · {duration(track.durationMs)}</span>}
          </p>
          {viewer && autoplay && (
            <AutoPlay
              track={{
                trackId,
                title: track.title,
                artist: track.artist,
                artistHref: `/artist/${encodeURIComponent(track.artistId)}`,
                ...(album ? { album: album.title, albumHref: `/album/${encodeURIComponent(album.albumId)}` } : {}),
                ...(track.cover ? { cover: track.cover } : {}),
              }}
            />
          )}
          {viewer && (
            <div className="export-buttons">
              <PlayButton
                track={{
                  trackId,
                  title: track.title,
                  artist: track.artist,
                  artistHref: `/artist/${encodeURIComponent(track.artistId)}`,
                  ...(album ? { album: album.title, albumHref: `/album/${encodeURIComponent(album.albumId)}` } : {}),
                  ...(track.cover ? { cover: track.cover } : {}),
                }}
              />
              <LoveButton trackId={trackId} loved={loved} />
              {navidrome && (
                <RadioButton seed={{ trackId }} label="Play this song, then similar songs from your Navidrome" />
              )}
            </div>
          )}
        </div>
      </div>

      {admin && <SongTools trackId={trackId} title={track.title} songs={otherSongs} />}

      <div className="tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="tile">
            <span className="muted">{tile.label}</span>
            <strong>{tile.value.toLocaleString("en")}</strong>
          </div>
        ))}
      </div>

      <section className="chart-card">
        <h2>Plays per day</h2>
        <p className="muted">Last 30 days, everyone together.</p>
        {last30 === 0 ? <p className="muted">No plays in the last 30 days.</p> : <DailyPlaysChart data={daily} />}
      </section>

      <section>
        <h2>People who play this also play</h2>
        {alsoPlayed.length === 0 ? (
          <p className="muted">Not enough listeners yet.</p>
        ) : (
          <ul className="listening-list">
            {alsoPlayed.map((other) => (
              <li key={other.trackId}>
                <Cover src={other.cover} />
                <span className="listening-info">
                  <span>
                    <Link href={`/track/${encodeURIComponent(other.trackId)}`}>{other.title}</Link>{" "}
                    <span className="muted">
                      · <ArtistLink name={other.artist} />
                    </span>
                  </span>
                  <small className="muted">{plural(other.listeners, "listener")} in common</small>
                </span>
                {viewer && (
                  <span className="list-play">
                    <PlayButton
                      track={{ trackId: other.trackId, title: other.title, artist: other.artist, cover: other.cover }}
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
