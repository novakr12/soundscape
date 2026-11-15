export type LyricLine = { at?: number; text: string };
export type Lyrics = { synced: boolean; instrumental?: boolean; lines: LyricLine[]; source: "navidrome" | "lrclib" };

const STAMP = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const MOST_LINES = 1000;

export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(STAMP)];
    if (stamps.length === 0) continue;
    const words = raw.replace(STAMP, "").trim();
    for (const stamp of stamps) {
      const seconds = Number(stamp[1]) * 60 + Number(stamp[2].replace(":", "."));
      if (Number.isFinite(seconds)) lines.push({ at: Math.round(seconds * 100) / 100, text: words });
    }
  }
  return lines.sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(0, MOST_LINES);
}

export function plainLines(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => ({ text: line.trim() }))
    .slice(0, MOST_LINES);
}

type StructuredLine = { start?: unknown; value?: unknown };
type Structured = { synced?: unknown; offset?: unknown; line?: StructuredLine[] };

export function fromNavidrome(list: Structured[] | undefined): Lyrics | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const chosen = list.find((entry) => entry.synced === true) ?? list[0];
  const offset = typeof chosen.offset === "number" ? chosen.offset : 0;
  const lines = (chosen.line ?? []).flatMap((line): LyricLine[] => {
    const text = typeof line.value === "string" ? line.value.trim() : "";
    if (chosen.synced !== true) return [{ text }];
    if (typeof line.start !== "number") return [];
    return [{ at: Math.max(0, (line.start + offset) / 1000), text }];
  });
  if (lines.every((line) => line.text === "")) return null;
  return { synced: chosen.synced === true, lines: lines.slice(0, MOST_LINES), source: "navidrome" };
}

export type LrclibHit = {
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

export function fromLrclib(hits: LrclibHit[], seconds?: number): Lyrics | null {
  const close = (hit: LrclibHit) =>
    !seconds || typeof hit.duration !== "number" || Math.abs(hit.duration - seconds) <= 3;
  const fitting = hits.filter(close);
  const synced = fitting.find((hit) => hit.syncedLyrics);
  if (synced?.syncedLyrics) {
    const lines = parseLrc(synced.syncedLyrics);
    if (lines.length > 0) return { synced: true, lines, source: "lrclib" };
  }
  const plain = fitting.find((hit) => hit.plainLyrics);
  if (plain?.plainLyrics) return { synced: false, lines: plainLines(plain.plainLyrics), source: "lrclib" };
  if (fitting.some((hit) => hit.instrumental))
    return { synced: false, instrumental: true, lines: [], source: "lrclib" };
  return null;
}

export function currentLine(lines: LyricLine[], seconds: number) {
  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].at;
    if (at === undefined || at > seconds) break;
    found = i;
  }
  return found;
}
