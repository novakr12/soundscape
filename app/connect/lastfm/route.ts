import { NextResponse } from "next/server";
import { authUrl, newState, STATE_COOKIE, scrobblingConfigured } from "@/lib/lastfm-scrobble";
import { publicOrigin } from "@/lib/public-origin";
import { redirectTo } from "@/lib/relative-redirect";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = publicOrigin(request);
  if (!(await currentUserId())) return redirectTo("/login?next=/connect");
  if (!scrobblingConfigured()) return redirectTo("/connect?lastfm=unavailable#lastfm");
  const state = newState();
  const callback = new URL("/connect/lastfm/callback", origin);
  callback.searchParams.set("state", state);
  const response = NextResponse.redirect(authUrl(callback.toString()));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https:"),
    path: "/connect/lastfm",
    maxAge: 10 * 60,
  });
  return response;
}
