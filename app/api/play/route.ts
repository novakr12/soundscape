import { NextResponse } from "next/server";
import { recordPlay } from "@/lib/plays";
import { currentUserId } from "@/lib/session";

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Log in to play tracks" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const trackId = body?.trackId;

  if (typeof trackId !== "string" || !trackId) {
    return NextResponse.json({ error: "trackId is required" }, { status: 400 });
  }

  const play = await recordPlay(userId, trackId);
  if (!play) {
    return NextResponse.json({ error: `Unknown track: ${trackId}` }, { status: 404 });
  }

  return NextResponse.json(play, { status: 201 });
}
