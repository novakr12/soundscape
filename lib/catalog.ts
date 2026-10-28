const CREDIT = /^(?:feat\.?|ft\.?|featuring|with|prod\.|produced by)\s/i;
const SAME_RECORDING = new RegExp(
  `^(?:${[
    String.raw`(?:\d{4}\s+)?(?:digital(?:ly)?\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?`,
    String.raw`(?:radio|single|album|original|short|clean|explicit|dirty|mono|stereo)(?:\s+(?:edit|version|mix))?`,
    "edit",
  ].join("|")})$`,
  "i",
);
const TRAILING_BRACKETS = /\s*[([]([^()[\]]*)[)\]]\s*$/;
const TRAILING_DASH = /\s+-\s+([^-]+)$/;
const BRACKETED_CREDIT = /\s*[([](?:feat\.?|ft\.?|featuring|with|prod\.|produced by)\s[^)\]]*[)\]]/gi;
const BARE_CREDIT = /\s+(?:feat\.?|ft\.?|featuring|prod\.)\s.*$/i;

export function slug(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function withoutTrailingLabels(title: string) {
  let current = title;
  for (;;) {
    const match = current.match(TRAILING_BRACKETS) ?? current.match(TRAILING_DASH);
    const label = match?.[1].trim() ?? "";
    if (!match || !(SAME_RECORDING.test(label) || CREDIT.test(label))) return current;
    current = current.slice(0, match.index);
  }
}

export function songTitle(title: string) {
  const trimmed = title.trim();
  const withoutCredits = withoutTrailingLabels(trimmed).replace(BRACKETED_CREDIT, "").replace(BARE_CREDIT, "");
  const clean = withoutTrailingLabels(withoutCredits);
  return clean.trim() || trimmed;
}

export function songArtist(artist: string) {
  const trimmed = artist.trim();
  return trimmed.replace(BRACKETED_CREDIT, "").replace(BARE_CREDIT, "").trim() || trimmed;
}

export function artistIdFor(artist: string) {
  return slug(songArtist(artist));
}

export function trackIdFor(artist: string, title: string) {
  return `${slug(songArtist(artist))}-${slug(songTitle(title))}`;
}
