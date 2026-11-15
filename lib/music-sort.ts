import type { AlbumOrder } from "./navidrome";

export type SongOrder = "title" | "artist" | "album" | "length";

type Sortable = { title: string; artist: string; album?: string; duration?: number; disc?: number; track?: number };

const LIBRARY_SORTS: { value: AlbumOrder; label: string }[] = [
  { value: "artist", label: "Artist" },
  { value: "album", label: "Album" },
  { value: "added", label: "Recently added" },
  { value: "year", label: "Newest year" },
  { value: "played", label: "Most played" },
];

const LIST_SORTS: { value: SongOrder; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "artist", label: "Artist" },
  { value: "album", label: "Album" },
  { value: "length", label: "Length" },
];

export function sortChoices(kind: "library" | "search" | "playlist") {
  if (kind === "library") return LIBRARY_SORTS;
  const first = kind === "playlist" ? "Playlist order" : "Best match";
  return [{ value: "", label: first }, ...LIST_SORTS];
}

export function libraryOrder(value: string | undefined): AlbumOrder {
  return LIBRARY_SORTS.find((choice) => choice.value === value)?.value ?? "artist";
}

export function songOrder(value: string | undefined): SongOrder | null {
  return LIST_SORTS.find((choice) => choice.value === value)?.value ?? null;
}

const words = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function text(a: string | undefined, b: string | undefined) {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return words.compare(a, b);
}

function inAlbum(a: Sortable, b: Sortable) {
  return (a.disc ?? 1) - (b.disc ?? 1) || (a.track ?? 0) - (b.track ?? 0);
}

export function sortSongs<T extends Sortable>(songs: T[], order: SongOrder | null): T[] {
  if (!order) return songs;
  const compare: Record<SongOrder, (a: T, b: T) => number> = {
    title: (a, b) => text(a.title, b.title) || text(a.artist, b.artist),
    artist: (a, b) => text(a.artist, b.artist) || text(a.album, b.album) || inAlbum(a, b) || text(a.title, b.title),
    album: (a, b) => text(a.album, b.album) || text(a.artist, b.artist) || inAlbum(a, b),
    length: (a, b) => (a.duration ?? 0) - (b.duration ?? 0) || text(a.title, b.title),
  };
  return songs
    .map((song, index) => ({ song, index }))
    .sort((a, b) => compare[order](a.song, b.song) || a.index - b.index)
    .map(({ song }) => song);
}
