import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import ArtistSongs, { type ArtistSongRow } from "@/components/artist-songs";
import Cover from "@/components/cover";
import { ArtistTools } from "@/components/library-tools";
import { isAdmin } from "@/lib/admin";
import { albumsBy } from "@/lib/albums";
import { artistAlias } from "@/lib/aliases";
import { matchArtistAlbums, matchArtistSongs } from "@/lib/artist-catalog";
import { ensureArtistInfo } from "@/lib/artist-info";
import { type Artist, getArtist, getSimilarArtists, getTopSongs, getYourArtistPlays } from "@/lib/artists";
import { artistIdFor, mainArtist, slug, trackIdFor } from "@/lib/catalog";
import { guessTrackId, navidromeCover } from "@/lib/music";
import { getNavidrome } from "@/lib/navidrome";
import { findNavidromeArtist, type NavidromeArtistCatalog } from "@/lib/navidrome-library";
import { routeParam } from "@/lib/route-param";
import { currentUserId } from "@/lib/session";

type Props = { params: Promise<{ artistId: string }>; searchParams?: Promise<{ name?: string }> };

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const artist = await getArtist(routeParam((await params).artistId));
  if (artist) return { title: `${artist.name} · Soundscape` };
  const given = searchParams ? (await searchParams)?.name?.trim() : undefined;
  return { title: given ? `${given} · Soundscape` : "Soundscape" };
}

export default async function ArtistPage({ params, searchParams }: Props) {
  const artistId = routeParam((await params).artistId);
  const [artist, viewer] = await Promise.all([getArtist(artistId), currentUserId()]);
  let knownArtist: Artist | null = artist;
  const isKnownArtist = Boolean(artist);
  let unplayedCatalog: NavidromeArtistCatalog | null = null;
  let navidrome: Awaited<ReturnType<typeof getNavidrome>> = null;

  if (!knownArtist) {
    const target = await artistAlias(artistId);
    if (target) redirect(`/artist/${encodeURIComponent(target)}`);
    const givenName = searchParams ? (await searchParams)?.name?.trim().slice(0, 300) : undefined;
    if (!givenName) notFound();
    const givenId = artistIdFor(givenName);
    if (givenId && givenId !== artistId) {
      const foundId = (await getArtist(givenId)) ? givenId : await artistAlias(givenId);
      if (foundId) redirect(`/artist/${encodeURIComponent(foundId)}`);
    }
    navidrome = viewer ? await getNavidrome(viewer) : null;
    unplayedCatalog = navidrome ? await findNavidromeArtist(navidrome, givenName).catch(() => null) : null;
    if (unplayedCatalog) {
      knownArtist = {
        artistId,
        name: unplayedCatalog.name || givenName,
        genres: [],
        plays: 0,
        listeners: 0,
        songs: 0,
        facts: [],
        links: [],
        infoChecked: true,
      };
    } else {
      const primaryId = artistIdFor(mainArtist(givenName));
      if (primaryId && primaryId !== artistId) {
        const resolvedPrimary = (await getArtist(primaryId)) ? primaryId : await artistAlias(primaryId);
        if (resolvedPrimary) redirect(`/artist/${encodeURIComponent(resolvedPrimary)}`);
      }
      notFound();
    }
  } else {
    navidrome = viewer ? await getNavidrome(viewer) : null;
  }

  if (isKnownArtist && !knownArtist.infoChecked) after(() => ensureArtistInfo(artistId));

  const [rawSongs, similar, yourPlays, rawAlbums, catalog] = isKnownArtist
    ? await Promise.all([
        getTopSongs(artistId, navidrome ? 500 : 10),
        getSimilarArtists(artistId),
        viewer ? getYourArtistPlays(viewer, artistId) : null,
        albumsBy(artistId, navidrome ? 500 : 24),
        navidrome ? findNavidromeArtist(navidrome, knownArtist.name).catch(() => null) : null,
      ])
    : [[], [], viewer ? 0 : null, [], unplayedCatalog];
  const playedSongs = catalog ? rawSongs : rawSongs.slice(0, 10);
  const playedAlbums = catalog ? rawAlbums : rawAlbums.slice(0, 24);

  const {
    matched: matchedAlbums,
    extra: extraAlbums,
    albumHrefByTitleSlug,
    albumHrefByNavId,
  } = matchArtistAlbums(playedAlbums, catalog?.albums ?? []);
  const { matched: matchedSongs, extra: extraSongs } = matchArtistSongs(playedSongs, catalog?.songs ?? []);

  const resolveAlbumHref = (song: { albumId?: string; album?: string }) =>
    (song.albumId ? albumHrefByNavId.get(song.albumId) : undefined) ??
    (song.album ? albumHrefByTitleSlug.get(slug(song.album)) : undefined) ??
    (song.albumId ? `/music?album=${encodeURIComponent(song.albumId)}` : undefined);

  const songRows: ArtistSongRow[] = [
    ...playedSongs.map((song, index) => {
      const navSong = matchedSongs[index];
      const cover = song.cover ?? navidromeCover(navSong?.coverArt);
      const albumName = song.album ?? navSong?.album;
      const albumHref = song.albumId
        ? `/album/${encodeURIComponent(song.albumId)}`
        : navSong
          ? resolveAlbumHref(navSong)
          : undefined;
      return {
        key: song.trackId,
        title: song.title,
        href: `/track/${encodeURIComponent(song.trackId)}`,
        stats: `${plural(song.plays, "play")} · ${plural(song.listeners, "listener")}`,
        track: {
          trackId: song.trackId,
          title: song.title,
          artist: knownArtist.name,
          artistHref: `/artist/${encodeURIComponent(artistId)}`,
          ...(cover ? { cover } : {}),
          ...(albumName ? { album: albumName } : {}),
          ...(albumHref ? { albumHref } : {}),
          ...(navSong ? { songId: navSong.id } : {}),
          ...(navSong?.gain ? { gain: navSong.gain } : {}),
          ...(navSong?.duration ? { duration: navSong.duration } : {}),
        },
      };
    }),
    ...extraSongs.map((song) => {
      const cover = navidromeCover(song.coverArt);
      const trackArtist = song.artist && song.artist !== "Unknown artist" ? song.artist : knownArtist.name;
      const trackArtistId = artistIdFor(trackArtist);
      const trackArtistHref =
        trackArtistId && trackArtistId !== artistId
          ? `/artist/${encodeURIComponent(trackArtistId)}?name=${encodeURIComponent(trackArtist)}`
          : isKnownArtist
            ? `/artist/${encodeURIComponent(artistId)}`
            : `/artist/${encodeURIComponent(artistId)}?name=${encodeURIComponent(knownArtist.name)}`;
      const trackId = (trackArtistId && trackIdFor(trackArtist, song.title)) || guessTrackId(artistId, song.title);
      const albumHref = resolveAlbumHref(song);
      return {
        key: `navidrome-${song.id}`,
        title: song.title,
        stats: [song.album, "Not played yet", "in your Navidrome"].filter(Boolean).join(" · "),
        track: {
          trackId,
          title: song.title,
          artist: trackArtist,
          artistHref: trackArtistHref,
          ...(cover ? { cover } : {}),
          ...(song.album ? { album: song.album } : {}),
          ...(albumHref ? { albumHref } : {}),
          songId: song.id,
          ...(song.gain ? { gain: song.gain } : {}),
          ...(song.duration ? { duration: song.duration } : {}),
          newSong: true,
        },
      };
    }),
  ];

  const albumRows = [
    ...playedAlbums.map((album, index) => ({
      key: album.albumId,
      title: album.title,
      href: `/album/${encodeURIComponent(album.albumId)}`,
      cover: album.cover ?? navidromeCover(matchedAlbums[index]?.coverArt),
      subtitle: `${plural(album.plays, "play")} · ${plural(album.tracks, "song")} played`,
    })),
    ...extraAlbums.map((album) => ({
      key: `navidrome-${album.id}`,
      title: album.name,
      href: `/music?album=${encodeURIComponent(album.id)}`,
      cover: navidromeCover(album.coverArt),
      subtitle: [
        album.year ? String(album.year) : null,
        album.songCount ? plural(album.songCount, "song") : null,
        "Not played yet · in your Navidrome",
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  ];

  const headerCover =
    knownArtist.photo ??
    songRows.find((row) => row.track.cover)?.track.cover ??
    navidromeCover(catalog?.coverArt ?? catalog?.albums.find((album) => album.coverArt)?.coverArt);

  const tiles = [
    { label: "Plays", value: knownArtist.plays },
    { label: "Listeners", value: knownArtist.listeners },
    { label: "Songs played", value: knownArtist.songs },
    ...(yourPlays === null ? [] : [{ label: "Your plays", value: yourPlays }]),
  ];

  return (
    <>
      <div className="song-header">
        <Cover src={headerCover} large round={Boolean(knownArtist.photo)} />
        <div>
          <p className="muted">Artist</p>
          <h1>{knownArtist.name}</h1>
          {knownArtist.facts.length > 0 && <p className="muted">{knownArtist.facts.join(" · ")}</p>}
          {knownArtist.genres.length > 0 && <p className="muted">{knownArtist.genres.join(" · ")}</p>}
        </div>
      </div>

      {isKnownArtist && isAdmin(viewer) && <ArtistTools artistId={artistId} name={knownArtist.name} />}

      {knownArtist.bio && (
        <p className="artist-bio">
          {knownArtist.bio}
          {knownArtist.bioUrl && (
            <>
              {" "}
              <a href={knownArtist.bioUrl} target="_blank" rel="noopener noreferrer">
                Read more on Wikipedia
              </a>
            </>
          )}
        </p>
      )}
      {knownArtist.links.length > 0 && (
        <nav className="year-links artist-links" aria-label="Links">
          {knownArtist.links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          ))}
        </nav>
      )}

      <div className="tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="tile">
            <span className="muted">{tile.label}</span>
            <strong>{tile.value.toLocaleString("en")}</strong>
          </div>
        ))}
      </div>

      <ArtistSongs
        rows={songRows}
        canPlay={Boolean(viewer)}
        artistId={artistId}
        artistName={knownArtist.name}
        hasNavidrome={isKnownArtist && Boolean(navidrome)}
        navidromeArtistId={catalog?.artistId}
        songsTruncated={catalog?.songsTruncated}
        hasUnplayed={extraSongs.length > 0}
      />

      {albumRows.length > 0 && (
        <section>
          <h2>Albums</h2>
          <ul className="listening-list">
            {albumRows.map((album) => (
              <li key={album.key}>
                <Cover src={album.cover} lazy />
                <span className="listening-info">
                  <Link href={album.href} prefetch={false}>
                    {album.title}
                  </Link>
                  <small className="muted">{album.subtitle}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Similar artists</h2>
        {similar.length === 0 ? (
          <p className="muted">Not enough listeners yet.</p>
        ) : (
          <ul className="listening-list">
            {similar.map((other) => (
              <li key={other.artistId}>
                <Cover src={other.cover} round={other.photo} />
                <span className="listening-info">
                  <Link href={`/artist/${encodeURIComponent(other.artistId)}`} prefetch={false}>
                    {other.name}
                  </Link>
                  <small className="muted">{plural(other.listeners, "listener")} in common</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
