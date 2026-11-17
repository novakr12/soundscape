export const COVER_RETRY_DELAY_MS = 1500;
const OUR_COVERS = /^\/api\/(navidrome\/cover|cover)\//;

export function retryAddress(src: string, origin: string, attempt: number) {
  let address: URL;
  try {
    address = new URL(src, origin);
  } catch {
    return null;
  }
  if (address.origin !== origin || !OUR_COVERS.test(address.pathname)) return null;
  if (address.searchParams.has("again")) return null;
  address.searchParams.set("again", String(attempt));
  return address.pathname + address.search;
}
