import { NextResponse } from "next/server";
import { ensureDeezerId, getPreviewUrl } from "@/lib/deezer";
import { currentUserId } from "@/lib/session";

type Context = {
  params: Promise<{ trackId: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  if (!(await currentUserId())) {
    return NextResponse.json({ error: "Log in to listen" }, { status: 401 });
  }

  const { trackId } = await params;
  let preview: string | null;
  try {
    const deezerId = await ensureDeezerId(trackId);
    preview = deezerId == null ? null : await getPreviewUrl(deezerId);
  } catch {
    return NextResponse.json({ error: "Deezer is unreachable" }, { status: 502 });
  }
  if (!preview) {
    return NextResponse.json({ error: "No preview for this track" }, { status: 404 });
  }

  return NextResponse.redirect(preview, { status: 307, headers: { "cache-control": "no-store" } });
}
