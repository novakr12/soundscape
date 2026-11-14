function originOf(address: string | null) {
  if (!address) return null;
  try {
    const url = new URL(address);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function publicOrigin(request: Request) {
  const fromPage = originOf(request.headers.get("referer"));
  if (fromPage) return fromPage;
  const fallback = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || fallback.host;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwarded === "https" || forwarded === "http" ? forwarded : fallback.protocol.replace(":", "");
  return `${protocol}://${host}`;
}
