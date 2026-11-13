import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { endOtherSessions, endSession, sessionKey, sessionUser, startSession } from "@/lib/sessions";

const COOKIE = "soundscape_session";
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export const currentUserId = cache(async (): Promise<string | null> => {
  return sessionUser((await cookies()).get(COOKIE)?.value);
});

export async function currentSessionKey(): Promise<string | null> {
  return sessionKey((await cookies()).get(COOKIE)?.value);
}

export async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  return userId;
}

export async function logIn(userId: string) {
  const token = await startSession(userId);
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: COOKIE_MAX_AGE });
}

export async function logOut() {
  const jar = await cookies();
  await endSession(jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}

export async function logOutOtherDevices(userId: string) {
  await endOtherSessions(userId, (await cookies()).get(COOKIE)?.value);
}
