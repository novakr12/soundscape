export type DesktopCopyWindow = Window & {
  soundscapeDesktopCopy?: (text: string) => boolean;
};

export async function copyText(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const desktop = (window as DesktopCopyWindow).soundscapeDesktopCopy;
  if (typeof desktop === "function") {
    try {
      if (desktop(text)) return true;
    } catch {}
  }

  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }

  if (typeof document !== "undefined" && typeof document.execCommand === "function") {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    field.style.pointerEvents = "none";
    document.body.appendChild(field);
    try {
      field.focus();
      field.select();
      field.setSelectionRange(0, text.length);
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }

  return false;
}
