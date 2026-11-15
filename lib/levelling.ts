export type Gain = { track?: number; album?: number; trackPeak?: number; albumPeak?: number };

const LOUDEST_GAIN_DB = 24;

function decibels(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= LOUDEST_GAIN_DB ? value : undefined;
}

function peak(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10 ? value : undefined;
}

function tidy(gain: Gain): Gain | undefined {
  const kept = Object.fromEntries(Object.entries(gain).filter(([, value]) => value !== undefined)) as Gain;
  return kept.track === undefined && kept.album === undefined ? undefined : kept;
}

export function fromReplayGain(raw: unknown): Gain | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  return tidy({
    track: decibels(value.trackGain),
    album: decibels(value.albumGain),
    trackPeak: peak(value.trackPeak),
    albumPeak: peak(value.albumPeak),
  });
}

export function savedGain(raw: unknown): Gain | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  return tidy({
    track: decibels(value.track),
    album: decibels(value.album),
    trackPeak: peak(value.trackPeak),
    albumPeak: peak(value.albumPeak),
  });
}

export function gainLevel(gain: Gain | undefined, byAlbum: boolean) {
  if (!gain) return 1;
  const useAlbum = byAlbum && gain.album !== undefined;
  const db = useAlbum ? gain.album : (gain.track ?? gain.album);
  if (db === undefined) return 1;
  const top = useAlbum ? (gain.albumPeak ?? gain.trackPeak) : (gain.trackPeak ?? gain.albumPeak);
  const level = Math.min(10 ** (db / 20), top ? 1 / top : 1, 1);
  return Math.round(level * 1000) / 1000;
}

type AlbumTrack = { album?: string; artist: string };

function sameAlbum(a: AlbumTrack | undefined, b: AlbumTrack | undefined) {
  return Boolean(a?.album && b?.album && a.album === b.album && a.artist === b.artist);
}

export function playingAnAlbum(inPlayOrder: AlbumTrack[], position: number) {
  const here = inPlayOrder[position];
  return sameAlbum(here, inPlayOrder[position - 1]) || sameAlbum(here, inPlayOrder[position + 1]);
}
