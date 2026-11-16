import { getNavidrome, streamSong } from "@/lib/navidrome";
import { sessionOrTokenUser } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ songId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return Response.json({ error: "Log in to listen" }, { status: 401 });
  const server = await getNavidrome(userId);
  if (!server) return Response.json({ error: "Connect Navidrome on the Connect page first." }, { status: 404 });
  const { songId } = await params;
  return streamSong(server, songId, request.headers.get("range"));
}
