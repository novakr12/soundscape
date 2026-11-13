import { type FileListen, MIN_PLAYED_MS, text } from "./file-import";

export type AppleFile = { name: string; chunks: AsyncIterable<string> };
export type AppleHistory = { listens: FileListen[]; short: number; videos: number; noArtist: number };

export class AppleImportError extends Error {}

const SEPARATOR = /\s[-–—]\s/g;
const SPECIAL = /[",\r\n]/g;

export class CsvReader {
  private row: string[] = [];
  private field = "";
  private quoted = false;
  private afterQuote = false;
  private skipNewline = false;
  private started = false;

  constructor(private onRow: (row: string[]) => void) {}

  private endField() {
    this.row.push(this.field);
    this.field = "";
  }

  private endRow() {
    this.endField();
    const row = this.row;
    this.row = [];
    if (row.length > 1 || row[0] !== "") this.onRow(row);
  }

  push(chunk: string) {
    let i = 0;
    if (!this.started && chunk.length > 0) {
      this.started = true;
      if (chunk.charCodeAt(0) === 0xfeff) i = 1;
    }
    while (i < chunk.length) {
      if (this.quoted) {
        if (this.afterQuote) {
          this.afterQuote = false;
          if (chunk[i] === '"') {
            this.field += '"';
            i++;
            continue;
          }
          this.quoted = false;
          continue;
        }
        const quote = chunk.indexOf('"', i);
        if (quote < 0) {
          this.field += chunk.slice(i);
          return;
        }
        this.field += chunk.slice(i, quote);
        this.afterQuote = true;
        i = quote + 1;
        continue;
      }
      const char = chunk[i];
      if (this.skipNewline) {
        this.skipNewline = false;
        if (char === "\n") {
          i++;
          continue;
        }
      }
      if (char === '"' && this.field === "") {
        this.quoted = true;
        i++;
      } else if (char === ",") {
        this.endField();
        i++;
      } else if (char === "\n" || char === "\r") {
        this.endRow();
        this.skipNewline = char === "\r";
        i++;
      } else {
        SPECIAL.lastIndex = i + 1;
        const next = SPECIAL.exec(chunk)?.index ?? chunk.length;
        this.field += chunk.slice(i, next);
        i = next;
      }
    }
  }

  end() {
    if (this.field !== "" || this.row.length > 0) this.endRow();
  }
}

export function readCsv(content: string, onRow: (row: string[]) => void) {
  const reader = new CsvReader(onRow);
  reader.push(content);
  reader.end();
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

type Column = (row: string[]) => string;

function columnOf(header: string[], ...names: string[]): Column {
  for (const name of names) {
    const index = header.indexOf(name);
    if (index >= 0) return (row) => row[index] ?? "";
  }
  return () => "";
}

type Candidate = { artist: string; title: string; album: string; playedAt: number };

export async function readAppleMusicFiles(files: AppleFile[]): Promise<AppleHistory> {
  const finder = new ArtistFinder();
  const candidates: Candidate[] = [];
  const history: AppleHistory = { listens: [], short: 0, videos: 0, noArtist: 0 };
  let activityFiles = 0;

  for (const file of files) {
    let handle: ((row: string[]) => void) | null = null;
    const reader = new CsvReader((row) => {
      if (handle) return handle(row);
      const header = row.map((name) => name.trim().toLowerCase());
      if (header.includes("event start timestamp") || header.includes("event end timestamp")) {
        activityFiles++;
        handle = activityRows(header, finder, candidates, history);
      } else if (header.includes("track description")) {
        const description = columnOf(header, "track description");
        const album = columnOf(header, "container album name", "album name");
        handle = (data) => finder.addDescription(text(description(data)), text(album(data)));
      } else {
        throw new AppleImportError(`${file.name} isn't an Apple Music play history file.`);
      }
    });
    for await (const chunk of file.chunks) reader.push(chunk);
    reader.end();
    if (!handle) throw new AppleImportError(`${file.name} isn't an Apple Music play history file.`);
  }
  if (activityFiles === 0) {
    throw new AppleImportError(
      "Choose Apple Music Play Activity.csv too. It is the only file with the time of each play.",
    );
  }

  const seen = new Set<string>();
  for (const { title, album, playedAt, ...rest } of candidates) {
    const artist = rest.artist || finder.find(title, album);
    if (!artist) {
      history.noArtist++;
      continue;
    }
    const key = `${artist}\n${title}\n${playedAt}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    history.listens.push({ artist, title, playedAt, ...(album ? { album } : {}) });
  }
  return history;
}

function activityRows(header: string[], finder: ArtistFinder, candidates: Candidate[], history: AppleHistory) {
  const artistOf = columnOf(header, "artist name", "container artist name");
  const titleOf = columnOf(header, "song name", "content name");
  const albumOf = columnOf(header, "album name", "container album name");
  const startOf = columnOf(header, "event start timestamp");
  const endOf = columnOf(header, "event end timestamp");
  const playedOf = columnOf(header, "play duration milliseconds", "play duration in milliseconds");
  const mediaOf = columnOf(header, "media type", "item type");
  const eventOf = columnOf(header, "event type");

  return (row: string[]) => {
    const title = text(titleOf(row));
    if (!title || /lyric/i.test(eventOf(row))) return;
    const played = Number(playedOf(row)) || 0;
    if (played <= 0) return;
    if (/video/i.test(mediaOf(row))) {
      history.videos++;
      return;
    }
    if (played < MIN_PLAYED_MS) {
      history.short++;
      return;
    }
    const start = parseTime(startOf(row));
    const playedAt = Number.isNaN(start) ? parseTime(endOf(row)) - played : start;
    if (Number.isNaN(playedAt)) return;
    const album = text(albumOf(row));
    const artist = text(artistOf(row));
    finder.add(title, album, artist);
    candidates.push({ artist, title, album, playedAt });
  };
}
