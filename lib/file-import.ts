export const MIN_PLAYED_MS = 30_000;
export const FILE_BATCH = 1000;
export const MAX_TEXT = 300;

export type FileListen = { artist: string; title: string; album?: string; playedAt: number };

export function text(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "";
}
