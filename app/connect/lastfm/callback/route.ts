import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { connectLastfm, LastfmScrobbleError, STATE_COOKIE } from "@/lib/lastfm-scrobble";
import { publicOrigin } from "@/lib/public-origin";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

function sameState(expected: string | undefined, given: string | null) {
  if (!expected || !given || expected.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL("/login?next=/connect", origin));
  const params = request.nextUrl.searchParams;
  let outcome = "connected";
  if (!sameState(request.cookies.get(STATE_COOKIE)?.value, params.get("state"))) {
    outcome = "expired";
  } else {
    try {
      await connectLastfm(userId, params.get("token") ?? "");
    } catch (error) {
      if (!(error instanceof LastfmScrobbleError)) throw error;
      outcome = error.message.includes("unreachable") ? "unreachable" : "refused";
    }
  }
  const response = NextResponse.redirect(new URL(`/connect?lastfm=${outcome}#lastfm`, origin));
  response.cookies.set(STATE_COOKIE, "", { path: "/connect/lastfm", maxAge: 0 });
  return response;
}
