export function publicOrigin(request: Request) {
  const fallback = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || fallback.host;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwarded === "https" || forwarded === "http" ? forwarded : fallback.protocol.replace(":", "");
  return `${protocol}://${host}`;
}
