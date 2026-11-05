import { type FileListen, MIN_PLAYED_MS, text } from "./file-import";

export type AppleFile = { name: string; text: string };
export type AppleHistory = { listens: FileListen[]; short: number; videos: number; noArtist: number };

export class AppleImportError extends Error {}

const SEPARATOR = /\s[-–—]\s/g;

export function readCsv(content: string, onRow: (row: string[]) => void) {
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = content.charCodeAt(0) === 0xfeff ? 1 : 0;
  const end = () => {
    row.push(field);
    field = "";
  };
  for (; i < content.length; i++) {
    const char = content[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (content[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") end();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[i + 1] === "\n") i++;
      end();
      if (row.length > 1 || row[0] !== "") onRow(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    end();
    onRow(row);
  }
}

function readTable(file: AppleFile) {
  let header: string[] | null = null;
  const rows: string[][] = [];
  readCsv(file.text, (row) => {
    if (header) rows.push(row);
    else header = row.map((name) => name.trim().toLowerCase());
  });
  const columns: string[] = header ?? [];
  const column = (...names: string[]) => {
    for (const name of names) {
      const index = columns.indexOf(name);
      if (index >= 0) return (row: string[]) => row[index] ?? "";
    }
    return () => "";
  };
  return { columns, rows, column };
}

function parseTime(value: string) {
  const time = value.trim();
  if (!time) return Number.NaN;
  if (/^\d{12,}$/.test(time)) return Number(time);
  const iso = time.replace(" ", "T");
  return Date.parse(/(z|[+-]\d\d:?\d\d)$/i.test(iso) ? iso : `${iso}Z`);
}

class ArtistFinder {
  private byTitle = new Map<string, Map<string, Set<string>>>();

  add(title: string, album: string, artist: string) {
    if (!title || !artist) return;
    const albums = this.byTitle.get(title.toLowerCase()) ?? new Map<string, Set<string>>();
    this.byTitle.set(title.toLowerCase(), albums);
    const artists = albums.get(album.toLowerCase()) ?? new Set<string>();
    albums.set(album.toLowerCase(), artists);
    artists.add(artist);
  }

  addDescription(description: string, album: string) {
    for (const match of description.matchAll(SEPARATOR)) {
      const at = match.index ?? 0;
      this.add(description.slice(at + match[0].length).trim(), album, description.slice(0, at).trim());
    }
  }

  find(title: string, album: string) {
    const albums = this.byTitle.get(title.toLowerCase());
    if (!albums) return "";
    const onAlbum = album ? albums.get(album.toLowerCase()) : undefined;
    if (onAlbum?.size === 1) return [...onAlbum][0];
    const all = new Set([...albums.values()].flatMap((artists) => [...artists]));
    return all.size === 1 ? [...all][0] : "";
  }
}

export function readAppleMusicFiles(files: AppleFile[]): AppleHistory {
  const tables = files.map((file) => ({ file, ...readTable(file) }));
  const activity = tables.filter(
    (table) => table.columns.includes("event start timestamp") || table.columns.includes("event end timestamp"),
  );
  const tracks = tables.filter((table) => table.columns.includes("track description"));
  const unknown = tables.find((table) => !activity.includes(table) && !tracks.includes(table));
  if (unknown) throw new AppleImportError(`${unknown.file.name} isn't an Apple Music play history file.`);
  if (activity.length === 0) {
    throw new AppleImportError(
      "Choose Apple Music Play Activity.csv too. It is the only file with the time of each play.",
    );
  }

  const finder = new ArtistFinder();
  for (const table of tracks) {
    const description = table.column("track description");
    const album = table.column("container album name", "album name");
    for (const row of table.rows) finder.addDescription(text(description(row)), text(album(row)));
  }
  for (const table of activity) {
    const artist = table.column("artist name", "container artist name");
    const title = table.column("song name", "content name");
    const album = table.column("album name", "container album name");
    for (const row of table.rows) finder.add(text(title(row)), text(album(row)), text(artist(row)));
  }

  const history: AppleHistory = { listens: [], short: 0, videos: 0, noArtist: 0 };
  const seen = new Set<string>();
  for (const table of activity) {
    const artistOf = table.column("artist name", "container artist name");
    const titleOf = table.column("song name", "content name");
    const albumOf = table.column("album name", "container album name");
    const startOf = table.column("event start timestamp");
    const endOf = table.column("event end timestamp");
    const playedOf = table.column("play duration milliseconds", "play duration in milliseconds");
    const mediaOf = table.column("media type", "item type");
    const eventOf = table.column("event type");

    for (const row of table.rows) {
      const title = text(titleOf(row));
      if (!title || /lyric/i.test(eventOf(row))) continue;
      if (/video/i.test(mediaOf(row))) {
        history.videos++;
        continue;
      }
      const played = Number(playedOf(row)) || 0;
      if (played < MIN_PLAYED_MS) {
        history.short++;
        continue;
      }
      const start = parseTime(startOf(row));
      const playedAt = Number.isNaN(start) ? parseTime(endOf(row)) - played : start;
      if (Number.isNaN(playedAt)) continue;
      const album = text(albumOf(row));
      const artist = text(artistOf(row)) || finder.find(title, album);
      if (!artist) {
        history.noArtist++;
        continue;
      }
      const key = `${artist}\n${title}\n${playedAt}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      history.listens.push({ artist, title, playedAt, ...(album ? { album } : {}) });
    }
  }
  return history;
}
