import { resolveTrackId } from "@/lib/aliases";
import { publicCover } from "@/lib/covers";
import { sql } from "@/lib/postgres";
import { publicOrigin } from "@/lib/public-origin";
import { tokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

const LONGEST = 300;

export async function GET(request: Request) {
  if (!(await tokenUser(request))) return unauthorized();
  const params = new URL(request.url).searchParams;
  const artist = params.get("artist")?.trim().slice(0, LONGEST);
  const title = params.get("title")?.trim().slice(0, LONGEST);
  if (!artist || !title) return Response.json({ url: null });
  const trackId = await resolveTrackId(artist, title);
  const [row] = await sql`SELECT cover, navidrome_cover FROM tracks WHERE id = ${trackId}`;
  const origin = new URL(publicOrigin(request)).origin;
  return Response.json(
    { url: publicCover(trackId, row as { cover: string | null; navidrome_cover: string | null } | undefined, origin) },
    { headers: { "cache-control": "private, max-age=3600" } },
  );
}
