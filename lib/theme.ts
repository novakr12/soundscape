export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const DEFAULT_THEME: ThemeMode = "system";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function paintTheme(
  theme: unknown,
  root: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void },
): ThemeMode {
  const mode = theme === "light" || theme === "dark" ? theme : "system";
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  return mode;
}

export function syncThemeColor(
  theme: ThemeMode,
  doc: {
    querySelectorAll(
      selector: string,
    ): Iterable<{ getAttribute(name: string): string | null; setAttribute(name: string, value: string): void }>;
  },
) {
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    if (theme === "light") {
      meta.setAttribute("content", "#ffffff");
    } else if (theme === "dark") {
      meta.setAttribute("content", "#111111");
    } else {
      meta.setAttribute("content", meta.getAttribute("media")?.includes("dark") ? "#111111" : "#ffffff");
    }
  }
}
