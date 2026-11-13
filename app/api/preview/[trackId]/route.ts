import { NextResponse } from "next/server";
import { applePreviewFor } from "@/lib/apple-preview";
import { ensureDeezerId, getPreviewUrl } from "@/lib/deezer";
import { currentUserId } from "@/lib/session";

type Context = {
  params: Promise<{ trackId: string }>;
};

async function fromDeezer(trackId: string): Promise<string | null> {
  const deezerId = await ensureDeezerId(trackId);
  return deezerId == null ? null : await getPreviewUrl(deezerId);
}

export async function GET(_request: Request, { params }: Context) {
  if (!(await currentUserId())) {
    return NextResponse.json({ error: "Log in to listen" }, { status: 401 });
  }

  const { trackId } = await params;
  let preview: string | null = null;
  let unreachable = 0;
  try {
    preview = await fromDeezer(trackId);
  } catch {
    unreachable++;
  }
  if (!preview) {
    try {
      preview = await applePreviewFor(trackId);
    } catch {
      unreachable++;
    }
  }
  if (!preview) {
    return unreachable === 2
      ? NextResponse.json({ error: "Deezer and Apple Music are unreachable" }, { status: 502 })
      : NextResponse.json({ error: "No preview for this track" }, { status: 404 });
  }

  return NextResponse.redirect(preview, { status: 307, headers: { "cache-control": "no-store" } });
}
