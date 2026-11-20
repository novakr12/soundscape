import { getNavidrome, streamSong } from "@/lib/navidrome";
import { canStream, readPartySongId } from "@/lib/parties";
import { sessionOrTokenUser } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ songId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return Response.json({ error: "Log in to listen" }, { status: 401 });
  const { songId } = await params;
  const shared = readPartySongId(decodeURIComponent(songId));
  if (shared) {
    const host = await canStream(userId, shared.partyId, shared.songId);
    const hostServer = host ? await getNavidrome(host) : null;
    if (!hostServer) return Response.json({ error: "That song isn't part of a party you're in." }, { status: 404 });
    return streamSong(hostServer, shared.songId, request.headers.get("range"));
  }
  const server = await getNavidrome(userId);
  if (!server) return Response.json({ error: "Connect Navidrome on the Connect page first." }, { status: 404 });
  return streamSong(server, songId, request.headers.get("range"));
}
