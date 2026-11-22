import { NO_RESULTS, withoutRepeats } from "@/lib/finder";
import { navidromeSongsFor } from "@/lib/music";
import { MIN_QUERY_LENGTH, searchAlbums, searchArtists, searchSongs } from "@/lib/search";
import { sessionOrTokenUser } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

const LONGEST = 100;
const LIBRARY_WAIT_MS = 1500;
const LIBRARY_SONGS = 6;

function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, LONGEST);
  const noStore = { "cache-control": "private, no-store" };
  if (query.length < MIN_QUERY_LENGTH) return Response.json(NO_RESULTS, { headers: noStore });
  const userId = await sessionOrTokenUser(request);
  const [songs, artists, albums, library] = await Promise.all([
    searchSongs(query, 5),
    searchArtists(query, 4),
    searchAlbums(query, 4),
    userId ? within(navidromeSongsFor(userId, query, LIBRARY_SONGS), LIBRARY_WAIT_MS).catch(() => null) : null,
  ]);
  return Response.json(
    { songs, artists, albums, library: withoutRepeats(library ?? [], songs).slice(0, 4) },
    { headers: noStore },
  );
}
