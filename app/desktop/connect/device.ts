export function deviceName(value: unknown) {
  const name =
    typeof value === "string"
      ? value
          .replace(/[^\p{L}\p{N} ()._-]/gu, "")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  return (name || "Desktop app").slice(0, 60);
}
