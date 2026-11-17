import { fetchCoverArt, getNavidrome, isSongId, NavidromeBusy } from "@/lib/navidrome";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ coverArt: string }>;
};

const TRY_AGAIN_SECONDS = 5;

export async function GET(_request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Log in to see covers" }, { status: 401 });
  const { coverArt } = await params;
  if (!isSongId(coverArt)) return Response.json({ error: "Unknown cover." }, { status: 404 });
  const server = await getNavidrome(userId);
  if (!server) return Response.json({ error: "Connect Navidrome on the Connect page first." }, { status: 404 });
  try {
    const cover = await fetchCoverArt(server, coverArt, 300);
    if (!cover) {
      return Response.json(
        { error: "Navidrome has no cover for that song." },
        { status: 404, headers: { "cache-control": "private, max-age=3600" } },
      );
    }
    return new Response(new Uint8Array(cover.data), {
      headers: { "content-type": cover.type, "cache-control": "private, max-age=86400" },
    });
  } catch (error) {
    if (!(error instanceof NavidromeBusy)) throw error;
    return Response.json(
      { error: error.message },
      { status: 503, headers: { "cache-control": "no-store", "retry-after": String(TRY_AGAIN_SECONDS) } },
    );
  }
}
