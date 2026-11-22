export const FULL_COVER = 300;
export const COVER_SIZES = [96, 160, 256] as const;

const OWN_COVERS = ["/api/cover/", "/api/navidrome/cover/", "/api/party/"];
const DEEZER = /^(https:\/\/[a-z0-9.-]*dzcdn\.net\/images\/(?:cover|artist)\/[0-9a-f]+\/)(\d+)x\2(-[^/]*)$/;

export function coverSize(shown: number) {
  return COVER_SIZES.find((size) => size >= shown * 2) ?? FULL_COVER;
}

export function readCoverSize(value: string | null) {
  const size = Number(value);
  return COVER_SIZES.find((allowed) => allowed === size) ?? FULL_COVER;
}

export function sizedCover(src: string | undefined, shown: number) {
  if (!src) return src;
  const size = coverSize(shown);
  if (size >= FULL_COVER) return src;
  if (OWN_COVERS.some((start) => src.startsWith(start))) {
    return `${src}${src.includes("?") ? "&" : "?"}size=${size}`;
  }
  const deezer = DEEZER.exec(src);
  if (deezer && Number(deezer[2]) > size) return `${deezer[1]}${size}x${size}${deezer[3]}`;
  return src;
}
