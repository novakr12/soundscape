export function safeNext(value: unknown, fallback = "/") {
  if (typeof value !== "string" || value.length > 500) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://soundscape.invalid");
    return url.origin === "http://soundscape.invalid" ? `${url.pathname}${url.search}` : fallback;
  } catch {
    return fallback;
  }
}
