import { MIN_QUERY_LENGTH, searchArtists, searchSongs } from "@/lib/search";
import { tokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

const MAX_QUERY = 100;

export async function GET(request: Request) {
  const userId = await tokenUser(request);
  if (!userId) return unauthorized();
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  if (query.length < MIN_QUERY_LENGTH) return Response.json({ artists: [], songs: [] });
  const [artists, songs] = await Promise.all([searchArtists(query, 4), searchSongs(query, 6)]);
  return Response.json({
    artists: artists.map((artist) => ({
      id: artist.artistId,
      name: artist.name,
      plays: artist.plays,
      url: `/artist/${encodeURIComponent(artist.artistId)}`,
    })),
    songs: songs.map((song) => ({
      id: song.trackId,
      title: song.title,
      artist: song.artist,
      plays: song.plays,
      url: `/track/${encodeURIComponent(song.trackId)}`,
    })),
  });
}
