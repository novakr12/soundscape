import { FALLBACK_COVER, getCover } from "@/lib/covers";

type Context = {
  params: Promise<{ trackId: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  const cover = await getCover((await params).trackId);
  if (!cover) {
    return new Response(FALLBACK_COVER, {
      headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=300" },
    });
  }
  return new Response(new Uint8Array(cover.data), {
    headers: { "content-type": cover.type, "cache-control": "public, max-age=86400" },
  });
}
