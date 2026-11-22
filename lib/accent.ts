export const DEFAULT_ACCENT = "#1db954";

export const ACCENT_PRESETS = [
  { name: "Green", color: DEFAULT_ACCENT },
  { name: "Teal", color: "#14b8a6" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Purple", color: "#8b5cf6" },
  { name: "Pink", color: "#ec4899" },
  { name: "Red", color: "#ef4444" },
  { name: "Orange", color: "#f97316" },
  { name: "Yellow", color: "#eab308" },
] as const;

export function isAccent(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function paintAccent(
  accent: unknown,
  root: { style: { setProperty(name: string, value: string): void; removeProperty(name: string): unknown } },
) {
  const color = typeof accent === "string" && /^#[0-9a-f]{6}$/i.test(accent) ? accent.toLowerCase() : null;
  if (color === null || color === "#1db954") {
    for (const name of ["--accent", "--accent-fg", "--brand-green", "--logo-start", "--logo-end"]) {
      root.style.removeProperty(name);
    }
    return color && "#000000";
  }
  const light = [1, 3, 5]
    .map((at) => Number.parseInt(color.slice(at, at + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * light[0] + 0.7152 * light[1] + 0.0722 * light[2];
  const foreground = (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
  root.style.setProperty("--accent", color);
  root.style.setProperty("--accent-fg", foreground);
  root.style.setProperty("--brand-green", color);
  const toward = (target: number, share: number) =>
    `#${[1, 3, 5]
      .map((at) => Number.parseInt(color.slice(at, at + 2), 16))
      .map((channel) => Math.round(channel + (target - channel) * share))
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`;
  root.style.setProperty("--logo-start", toward(0, 0.2));
  root.style.setProperty("--logo-end", toward(255, 0.3));
  return foreground;
}
