import { getNavidrome, NavidromeError } from "@/lib/navidrome";
import { getPlaylists } from "@/lib/navidrome-library";
import { tokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await tokenUser(request);
  if (!userId) return unauthorized();
  const server = await getNavidrome(userId);
  if (!server) return Response.json({ connected: false, playlists: [] });
  try {
    const playlists = await getPlaylists(server);
    return Response.json({
      connected: true,
      playlists: playlists.map(({ id, name, songCount }) => ({ id, name, songCount })),
    });
  } catch (error) {
    if (!(error instanceof NavidromeError)) throw error;
    return Response.json({ connected: true, playlists: [], error: error.message });
  }
}
