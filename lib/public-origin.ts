function parseHttpUrl(address: string | null) {
  if (!address) return null;
  try {
    const url = new URL(address);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function publicOrigin(request: Request) {
  const fallback = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || fallback.host;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const referer = parseHttpUrl(request.headers.get("referer"));
  const sameHostReferer = referer && referer.host.toLowerCase() === host.toLowerCase() ? referer : null;
  const protocol =
    forwarded === "https" || forwarded === "http"
      ? forwarded
      : (sameHostReferer?.protocol ?? fallback.protocol).replace(":", "");
  return parseHttpUrl(`${protocol}://${host}`)?.origin ?? fallback.origin;
}
