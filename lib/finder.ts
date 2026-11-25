import { fold, fuzzySort } from "./fuzzy";
import type { AlbumResult, ArtistResult, SongResult } from "./search";

export type FinderLibrarySong = {
  trackId: string;
  songId?: string;
  title: string;
  artist: string;
  album?: string;
  albumHref?: string;
  cover?: string;
  newSong?: boolean;
  duration?: number;
};

export type FinderResults = {
  songs: SongResult[];
  artists: ArtistResult[];
  albums: AlbumResult[];
  library: FinderLibrarySong[];
};

export const NO_RESULTS: FinderResults = { songs: [], artists: [], albums: [], library: [] };

export type FinderPage = { label: string; href: string; words?: string };

export function finderPages(username: string | null, admin: boolean): FinderPage[] {
  return [
    { label: "Home", href: "/", words: "start week recap recently played" },
    { label: "Feed", href: "/feed", words: "friends following" },
    { label: "Music", href: "/music", words: "navidrome library albums playlists never played shuffle" },
    { label: "History", href: "/history", words: "plays scrobbles listened" },
    { label: "Charts", href: "/charts", words: "top trending" },
    { label: "Recommendations", href: "/recommendations", words: "discover new releases similar" },
    { label: "Mixes", href: "/mixes", words: "daily mix" },
    { label: "Stats", href: "/stats", words: "statistics clock streak" },
    { label: "Yearscape", href: "/yearscape", words: "year wrapped summary" },
    { label: "Import", href: "/import", words: "listenbrainz lastfm spotify apple" },
    { label: "Export", href: "/export", words: "download backup" },
    { label: "Connect", href: "/connect", words: "navidrome jellyfin tokens scrobbler" },
    ...(username
      ? [
          { label: "Your profile", href: `/u/${encodeURIComponent(username)}`, words: username },
          { label: "Notifications", href: "/notifications", words: "followers milestones" },
          {
            label: "Settings",
            href: "/settings",
            words: "preferences privacy password player levelling crossfade app desktop",
          },
        ]
      : [
          { label: "Log in", href: "/login" },
          { label: "Sign up", href: "/signup" },
        ]),
    ...(admin ? [{ label: "Admin", href: "/admin", words: "jobs errors users" }] : []),
  ];
}

export function withoutRepeats(library: FinderLibrarySong[], songs: SongResult[]) {
  const shown = new Set(songs.map((song) => song.trackId));
  return library.filter((song) => !shown.has(song.trackId));
}

const PAGES_SHOWN = 4;
const KEYWORD_FROM = 3;

export type FinderAction = "open" | "play" | "next" | "queue";

export function finderAction(keys: { shift: boolean; alt: boolean; ctrlOrMeta: boolean }): FinderAction {
  if (keys.ctrlOrMeta) return "queue";
  if (keys.alt) return "next";
  if (keys.shift) return "play";
  return "open";
}

export function findPages(query: string, pages: FinderPage[]) {
  const wanted = fold(query.trim());
  const byName = fuzzySort(wanted, pages, (page) => page.label);
  const byKeyword =
    wanted.length >= KEYWORD_FROM ? pages.filter((page) => fold(page.words ?? "").includes(wanted)) : [];
  return [...byName, ...byKeyword.filter((page) => !byName.includes(page))].slice(0, PAGES_SHOWN);
}
