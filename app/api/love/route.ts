import { isLoved, loveSong, songId } from "@/lib/loved";
import { tokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await tokenUser(request);
  if (!userId) return unauthorized();
  const params = new URL(request.url).searchParams;
  const trackId = await songId(params.get("artist") ?? "", params.get("title") ?? "");
  return Response.json({ loved: trackId !== null && (await isLoved(userId, trackId)) });
}

export async function POST(request: Request) {
  const userId = await tokenUser(request);
  if (!userId) return unauthorized();
  const body = await request.json().catch(() => null);
  const { artist, title, loved } = body ?? {};
  if (typeof artist !== "string" || typeof title !== "string" || typeof loved !== "boolean") {
    return Response.json({ error: "Send artist, title and loved." }, { status: 400 });
  }
  const trackId = await loveSong(userId, artist, title, loved);
  if (!trackId) return Response.json({ error: "artist and title are required." }, { status: 400 });
  return Response.json({ loved, trackId, url: `/track/${encodeURIComponent(trackId)}` });
}
