// Next.js hands dynamic route segments over still percent-encoded, so an id like
// "山下達郎" arrives as "%E5%B1%B1...". Decode it before using it as a catalog id.
export function routeParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
