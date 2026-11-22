import { coverUrl, FALLBACK_COVER, getCover } from "./covers";
import { request } from "./http";

export const FALLBACK = `data:image/svg+xml;base64,${Buffer.from(FALLBACK_COVER).toString("base64")}`;
const IMAGE_TYPES = ["image/jpeg", "image/png"];
const MAX_IMAGE_BYTES = 5_000_000;
const OG_CONCURRENCY = 2;

export type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

const loadedFonts = new Map<string, Promise<Font>>();

async function googleFont(family: string, weight: 400 | 700, text?: string): Promise<Font> {
  const query = `family=${family.replaceAll(" ", "+")}:wght@${weight}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?${query}`, { signal: AbortSignal.timeout(5000) })
  ).text();
  const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
  if (!url) throw new Error(`No font file for ${family}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Font ${family}: ${response.status}`);
  return { name: family, data: await response.arrayBuffer(), weight, style: "normal" };
}

function cachedFont(family: string, weight: 400 | 700, text?: string): Promise<Font> {
  const key = `${family}:${weight}:${text ?? ""}`;
  let pending = loadedFonts.get(key);
  if (!pending) {
    pending = googleFont(family, weight, text).catch((error) => {
      loadedFonts.delete(key);
      throw error;
    });
    loadedFonts.set(key, pending);
  }
  return pending;
}

async function fontSet(fonts: Promise<Font>[]): Promise<Font[] | undefined> {
  try {
    return await Promise.all(fonts);
  } catch {
    return undefined;
  }
}

export function loadFonts() {
  return fontSet([cachedFont("Geist", 400), cachedFont("Space Grotesk", 700, "Soundscape")]);
}

export function loadFontsWithBold() {
  return fontSet([cachedFont("Geist", 400), cachedFont("Geist", 700), cachedFont("Space Grotesk", 700, "Soundscape")]);
}

const ogGate = { active: 0, waiting: [] as (() => void)[] };

export async function renderOg<T>(work: () => Promise<T>): Promise<T> {
  if (ogGate.active >= OG_CONCURRENCY) {
    await new Promise<void>((resolve) => ogGate.waiting.push(resolve));
  } else {
    ogGate.active++;
  }
  try {
    return await work();
  } finally {
    const next = ogGate.waiting.shift();
    if (next) next();
    else ogGate.active--;
  }
}

async function coverImage(cover: string): Promise<string | undefined> {
  const local = cover.startsWith(coverUrl(""))
    ? await getCover(decodeURIComponent(cover.slice(coverUrl("").length)))
    : null;
  if (local)
    return IMAGE_TYPES.includes(local.type) ? `data:${local.type};base64,${local.data.toString("base64")}` : undefined;
  if (!/^https:\/\//.test(cover)) return undefined;
  const response = await request(cover, { timeoutMs: 5000 });
  const type = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (
    !response.ok ||
    !IMAGE_TYPES.includes(type) ||
    Number(response.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES
  ) {
    await response.body?.cancel().catch(() => {});
    return undefined;
  }
  const data = Buffer.from(await response.arrayBuffer());
  return data.length <= MAX_IMAGE_BYTES ? `data:${type};base64,${data.toString("base64")}` : undefined;
}

export async function loadCovers(urls: (string | undefined)[]) {
  const unique = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  const images = await Promise.all(unique.map((url) => coverImage(url).catch(() => undefined)));
  return new Map<string | undefined, string | undefined>(unique.map((url, i) => [url, images[i]]));
}

export const line = { display: "flex", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" } as const;
