import { readCoverSize } from "@/lib/cover-size";
import { fetchCoverArt, getNavidrome, isSongId, NavidromeBusy } from "@/lib/navidrome";
import { isPartyId, partyHostFor } from "@/lib/parties";
import { sessionOrTokenUser } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ partyId: string; coverArt: string }> };

export async function GET(request: Request, { params }: Context) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return Response.json({ error: "Log in to see covers" }, { status: 401 });
  const { partyId, coverArt } = await params;
  if (!isPartyId(partyId) || !isSongId(coverArt)) return Response.json({ error: "Unknown cover." }, { status: 404 });
  const host = await partyHostFor(userId, partyId);
  const server = host ? await getNavidrome(host) : null;
  if (!server) return Response.json({ error: "Unknown cover." }, { status: 404 });
  try {
    const cover = await fetchCoverArt(server, coverArt, readCoverSize(new URL(request.url).searchParams.get("size")));
    if (!cover) return Response.json({ error: "No cover." }, { status: 404 });
    return new Response(
      new Uint8Array(cover.data.buffer as ArrayBuffer, cover.data.byteOffset, cover.data.byteLength),
      {
        headers: { "content-type": cover.type, "cache-control": "private, max-age=86400" },
      },
    );
  } catch (error) {
    if (!(error instanceof NavidromeBusy)) throw error;
    return Response.json({ error: error.message }, { status: 503, headers: { "retry-after": "5" } });
  }
}
