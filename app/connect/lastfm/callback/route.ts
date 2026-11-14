import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { connectLastfm, LastfmScrobbleError, STATE_COOKIE } from "@/lib/lastfm-scrobble";
import { redirectTo } from "@/lib/relative-redirect";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

function sameState(expected: string | undefined, given: string | null) {
  if (!expected || !given || expected.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

export async function GET(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return redirectTo("/login?next=/connect");
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
  const response = redirectTo(`/connect?lastfm=${outcome}#lastfm`);
  response.headers.append("set-cookie", `${STATE_COOKIE}=; Path=/connect/lastfm; Max-Age=0; HttpOnly; SameSite=Lax`);
  return response;
}
