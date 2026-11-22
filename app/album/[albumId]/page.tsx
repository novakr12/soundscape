import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AlbumSongs, { type AlbumSongRow } from "@/components/album-songs";
import Cover from "@/components/cover";
import { getAlbum } from "@/lib/albums";
import { guessTrackId, matchAlbumSongs, navidromeAlbumFor, navidromeCover } from "@/lib/music";
import { routeParam } from "@/lib/route-param";
import { currentUserId } from "@/lib/session";
import { findKnownAlbum } from "@/lib/track-album";
import { ensureTracklist } from "@/lib/tracklists";

type Props = { params: Promise<{ albumId: string }>; searchParams?: Promise<{ artist?: string; title?: string }> };

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const album = await getAlbum(routeParam((await params).albumId), null);
  if (album) return { title: `${album.title} · ${album.artist} · Soundscape` };
  const query = searchParams ? await searchParams : undefined;
  const title = query?.title?.trim();
  const artist = query?.artist?.trim();
  return { title: title ? `${[title, artist].filter(Boolean).join(" · ")} · Soundscape` : "Soundscape" };
}

export default async function AlbumPage({ params, searchParams }: Props) {
  const albumId = routeParam((await params).albumId);
  const [viewer] = await Promise.all([currentUserId(), ensureTracklist(albumId)]);
  const album = await getAlbum(albumId, viewer);
  if (!album) {
    const query = searchParams ? await searchParams : undefined;
    const artistParam = query?.artist?.trim().slice(0, 300);
    const titleParam = query?.title?.trim().slice(0, 300);
    if (artistParam && titleParam) {
      const known = await findKnownAlbum(artistParam, titleParam);
      if (known?.albumHref && known.albumHref !== `/album/${encodeURIComponent(albumId)}`) {
        redirect(known.albumHref);
      }
      if (viewer) {
        const navAlbum = await navidromeAlbumFor(viewer, artistParam, titleParam);
        if (navAlbum?.id) {
          redirect(`/music?album=${encodeURIComponent(navAlbum.id)}`);
        }
      }
    }
    notFound();
  }
  const discs = new Set(album.tracks.map((track) => track.disc ?? 1)).size;
  const numbered = album.tracks.some((track) => track.number);
  const position = (track: (typeof album.tracks)[number], index: number) =>
    track.number
      ? discs > 1
        ? `${track.disc ?? 1}.${track.number}`
        : String(track.number)
      : numbered
        ? ""
        : String(index + 1);

  const navidrome = viewer ? await navidromeAlbumFor(viewer, album.artist, album.title) : null;
  const { matched, extra } = matchAlbumSongs(album.tracks, navidrome?.songs ?? []);
  const found: (AlbumSongRow & { songId?: string })[] = [
    ...album.tracks.map((track, index) => {
      const song = matched[index];
      const cover = track.cover ?? navidromeCover(song?.coverArt);
      const stats = [
        track.plays === 0 ? "Not played yet" : plural(track.plays, "play"),
        ...(viewer && track.yourPlays > 0 ? [`${plural(track.yourPlays, "play")} by you`] : []),
      ].join(" · ");
      const playable = track.trackId ?? (song ? guessTrackId(album.artistId, track.title) : undefined);
      return {
        songId: song?.id,
        key: track.trackId ?? `${track.disc}-${track.number}-${track.title}-${index}`,
        position: position(track, index),
        title: track.title,
        href: track.trackId ? `/track/${encodeURIComponent(track.trackId)}` : undefined,
        stats,
        track: playable
          ? {
              trackId: playable,
              title: track.title,
              artist: album.artist,
              artistHref: `/artist/${encodeURIComponent(album.artistId)}`,
              album: album.title,
              albumHref: `/album/${encodeURIComponent(albumId)}`,
              ...(cover ? { cover } : {}),
              ...(song ? { songId: song.id } : {}),
              ...(song?.gain ? { gain: song.gain } : {}),
              ...(song?.duration ? { duration: song.duration } : {}),
              ...(track.trackId ? {} : { newSong: true }),
            }
          : undefined,
      };
    }),
    ...extra.map((song, index) => {
      const cover = navidromeCover(song.coverArt);
      return {
        songId: song.id,
        key: `navidrome-${song.id}`,
        position: String(album.tracks.length + index + 1),
        title: song.title,
        stats: "Not played yet · in your Navidrome",
        track: {
          trackId: guessTrackId(album.artistId, song.title),
          title: song.title,
          artist: album.artist,
          artistHref: `/artist/${encodeURIComponent(album.artistId)}`,
          album: album.title,
          albumHref: `/album/${encodeURIComponent(albumId)}`,
          ...(cover ? { cover } : {}),
          songId: song.id,
          ...(song.gain ? { gain: song.gain } : {}),
          ...(song.duration ? { duration: song.duration } : {}),
          newSong: true,
        },
      };
    }),
  ];

  const navidromeDiscs = new Set(navidrome?.songs.map((song) => song.disc ?? 1)).size;
  const bySong = new Map(found.flatMap((row) => (row.songId ? [[row.songId, row] as const] : [])));
  const rows: AlbumSongRow[] =
    navidrome && extra.length > 0 && matched.every(Boolean)
      ? navidrome.songs.flatMap((song, index) => {
          const row = bySong.get(song.id);
          if (!row) return [];
          const number = song.track
            ? navidromeDiscs > 1
              ? `${song.disc ?? 1}.${song.track}`
              : String(song.track)
            : String(index + 1);
          return [{ ...row, position: number }];
        })
      : found;

  const tiles = [
    { label: "Plays", value: album.plays },
    { label: "Listeners", value: album.listeners },
    { label: "Songs played", value: album.played },
    ...(viewer ? [{ label: "Your plays", value: album.yourPlays }] : []),
  ];

  return (
    <>
      <div className="song-header">
        <Cover src={album.cover} large />
        <div>
          <p className="muted">Album</p>
          <h1>{album.title}</h1>
          <p>
            <Link href={`/artist/${encodeURIComponent(album.artistId)}`} prefetch={false}>
              {album.artist}
            </Link>
          </p>
        </div>
      </div>

      <div className="tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="tile">
            <span className="muted">{tile.label}</span>
            <strong>{tile.value.toLocaleString("en")}</strong>
          </div>
        ))}
      </div>

      <AlbumSongs rows={rows} canPlay={Boolean(viewer)} name={album.title} />
    </>
  );
}
