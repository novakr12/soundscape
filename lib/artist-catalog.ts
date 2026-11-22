import { artistIdFor, artistParts, fold, mainArtist, slug, songTitle } from "./catalog";
import type { NavidromeArtistAlbum, NavidromeSong } from "./navidrome-library";

const CREDIT_SPLIT = /\s*(?:,|&|;|\/|•|·|×|\bx\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b)\s*/i;
const TITLE_CREDIT = /(?:\(|\[|\s)(?:feat\.?|ft\.?|featuring|with)\s+([^)\]]+)/gi;
const BRACKETED_PROD = /\s*[([](?:prod\.|produced by)\s[^)\]]*[)\]]/gi;
const BARE_PROD = /\s+(?:prod\.|produced by)\s.*$/i;

function titleKey(title: string) {
  return slug(songTitle(title));
}

export function artistSearchQueries(name: string): string[] {
  const trimmed = name.trim();
  const joinedParts = artistParts(name).join(" ").trim();
  const candidates = [trimmed, joinedParts, fold(trimmed), fold(joinedParts)];
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (!candidate || seen.has(key)) continue;
    seen.add(key);
    queries.push(candidate);
  }
  return queries;
}

export function creditedIds(artist: string, title?: string): Set<string> {
  const ids = new Set<string>();
  const cleanArtist = artist.replace(BRACKETED_PROD, "").replace(BARE_PROD, "").trim();
  const fullId = artistIdFor(artist);
  if (fullId) ids.add(fullId);

  for (const part of cleanArtist.split(CREDIT_SPLIT)) {
    const id = slug(part.trim());
    if (id) ids.add(id);
  }

  if (title) {
    for (const match of title.matchAll(TITLE_CREDIT)) {
      const credit = match[1]?.trim();
      if (!credit) continue;
      for (const part of credit.split(CREDIT_SPLIT)) {
        const id = slug(part.trim());
        if (id) ids.add(id);
      }
    }
  }

  return ids;
}

export function matchesArtistRecord(targetName: string, candidateName: string): boolean {
  const targetId = artistIdFor(targetName);
  const candidateId = artistIdFor(candidateName);
  if (!targetId || !candidateId) return false;
  if (candidateId === targetId) return true;

  const targetParts = [...new Set(artistParts(targetName).map(artistIdFor).filter(Boolean))];
  if (targetParts.length <= 1) return false;

  const candidateParts = [...new Set(artistParts(candidateName).map(artistIdFor).filter(Boolean))];
  return candidateParts.length === targetParts.length && targetParts.every((part) => candidateParts.includes(part));
}

export function matchesSongForArtist(targetName: string, songArtistName: string, songTitleName?: string): boolean {
  const targetId = artistIdFor(targetName);
  if (!targetId) return false;
  if (artistIdFor(songArtistName) === targetId) return true;

  const targetParts = [...new Set(artistParts(targetName).map(artistIdFor).filter(Boolean))];
  if (targetParts.length > 1) {
    const credits = creditedIds(songArtistName, songTitleName);
    return targetParts.every((part) => credits.has(part));
  }

  return artistIdFor(mainArtist(songArtistName)) === targetId;
}

export function sortNavidromeAlbums(albums: readonly NavidromeArtistAlbum[]): NavidromeArtistAlbum[] {
  return [...albums].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));
}

export function matchArtistAlbums<T extends { albumId: string; title: string }>(
  played: readonly T[],
  navidromeAlbums: readonly NavidromeArtistAlbum[],
) {
  const seenIds = new Set<string>();
  const left: NavidromeArtistAlbum[] = [];
  for (const album of navidromeAlbums) {
    if (seenIds.has(album.id)) continue;
    seenIds.add(album.id);
    left.push(album);
  }

  const albumHrefByTitleSlug = new Map<string, string>();
  const albumHrefByNavId = new Map<string, string>();

  const matched = played.map((playedAlbum) => {
    const wanted = slug(playedAlbum.title);
    const href = `/album/${encodeURIComponent(playedAlbum.albumId)}`;
    if (wanted) albumHrefByTitleSlug.set(wanted, href);

    if (!wanted) return undefined;
    let firstMatch: NavidromeArtistAlbum | undefined;
    for (let i = left.length - 1; i >= 0; i--) {
      if (slug(left[i].name) === wanted) {
        const [removed] = left.splice(i, 1);
        albumHrefByNavId.set(removed.id, href);
        firstMatch = removed;
      }
    }
    return firstMatch;
  });

  const extra = sortNavidromeAlbums(left);
  for (const album of extra) {
    const href = `/music?album=${encodeURIComponent(album.id)}`;
    albumHrefByNavId.set(album.id, href);
    const key = slug(album.name);
    if (key && !albumHrefByTitleSlug.has(key)) albumHrefByTitleSlug.set(key, href);
  }

  return { matched, extra, albumHrefByTitleSlug, albumHrefByNavId };
}

export function matchArtistSongs<T extends { title: string; album?: string }>(
  played: readonly T[],
  navidromeSongs: readonly NavidromeSong[],
) {
  const seenIds = new Set<string>();
  const left: NavidromeSong[] = [];
  for (const song of navidromeSongs) {
    if (seenIds.has(song.id)) continue;
    seenIds.add(song.id);
    left.push(song);
  }

  const matched = played.map((track) => {
    const wanted = titleKey(track.title);
    if (!wanted) return undefined;
    const wantedAlbum = track.album ? slug(track.album) : "";
    let at = wantedAlbum
      ? left.findIndex(
          (song) => titleKey(song.title) === wanted && Boolean(song.album && slug(song.album) === wantedAlbum),
        )
      : -1;
    if (at < 0) at = left.findIndex((song) => titleKey(song.title) === wanted);
    return at >= 0 ? left.splice(at, 1)[0] : undefined;
  });

  const playedTitles = new Set(played.map((track) => titleKey(track.title)).filter(Boolean));
  const seenExtra = new Set<string>();
  const extra: NavidromeSong[] = [];
  for (const song of left) {
    const key = titleKey(song.title);
    if (key && playedTitles.has(key)) continue;
    const dedupeKey = `${key}\n${song.album ? slug(song.album) : ""}`;
    if (seenExtra.has(dedupeKey)) continue;
    seenExtra.add(dedupeKey);
    extra.push(song);
  }

  return { matched, extra };
}
