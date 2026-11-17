export function deviceName(value: unknown, fallback = "Desktop app") {
  const name =
    typeof value === "string"
      ? value
          .replace(/[^\p{L}\p{N} ()._-]/gu, "")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  return (name || fallback).slice(0, 60);
}
