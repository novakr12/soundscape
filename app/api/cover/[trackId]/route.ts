import { readCoverSize } from "@/lib/cover-size";
import { FALLBACK_COVER, findCover } from "@/lib/covers";

type Context = {
  params: Promise<{ trackId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const size = readCoverSize(new URL(request.url).searchParams.get("size"));
  const cover = await findCover((await params).trackId, size);
  if (cover === "busy" || !cover) {
    return new Response(FALLBACK_COVER, {
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": cover === "busy" ? "no-store" : "public, max-age=300",
      },
    });
  }
  return new Response(new Uint8Array(cover.data), {
    headers: { "content-type": cover.type, "cache-control": "public, max-age=86400" },
  });
}
