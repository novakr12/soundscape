import { coverUrl, FALLBACK_COVER, getCover } from "./covers";

export const FALLBACK = `data:image/svg+xml;base64,${Buffer.from(FALLBACK_COVER).toString("base64")}`;
const IMAGE_TYPES = ["image/jpeg", "image/png"];
const MAX_IMAGE_BYTES = 5_000_000;

export type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

const loaded = new Map<string, Promise<Font[] | undefined>>();

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

function fontSet(name: string, load: () => Promise<Font>[]) {
  let fonts = loaded.get(name);
  if (!fonts) {
    fonts = Promise.all(load()).catch(() => {
      loaded.delete(name);
      return undefined;
    });
    loaded.set(name, fonts);
  }
  return fonts;
}

export function loadFonts() {
  return fontSet("regular", () => [googleFont("Geist", 400), googleFont("Space Grotesk", 700, "Soundscape")]);
}

export function loadFontsWithBold() {
  return fontSet("bold", () => [
    googleFont("Geist", 400),
    googleFont("Geist", 700),
    googleFont("Space Grotesk", 700, "Soundscape"),
  ]);
}

async function coverImage(cover: string): Promise<string | undefined> {
  const local = cover.startsWith(coverUrl(""))
    ? await getCover(decodeURIComponent(cover.slice(coverUrl("").length)))
    : null;
  if (local)
    return IMAGE_TYPES.includes(local.type) ? `data:${local.type};base64,${local.data.toString("base64")}` : undefined;
  if (!/^https:\/\//.test(cover)) return undefined;
  const response = await fetch(cover, { signal: AbortSignal.timeout(5000) });
  const type = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!response.ok || !IMAGE_TYPES.includes(type)) return undefined;
  if (Number(response.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return undefined;
  const data = Buffer.from(await response.arrayBuffer());
  return data.length <= MAX_IMAGE_BYTES ? `data:${type};base64,${data.toString("base64")}` : undefined;
}

export async function loadCovers(urls: (string | undefined)[]) {
  const unique = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  const images = await Promise.all(unique.map((url) => coverImage(url).catch(() => undefined)));
  return new Map<string | undefined, string | undefined>(unique.map((url, i) => [url, images[i]]));
}

export const line = { display: "flex", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" } as const;
