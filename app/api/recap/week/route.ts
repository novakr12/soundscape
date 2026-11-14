import { tokenUser, unauthorized } from "@/lib/token-auth";
import { lastWeekRecap, showWeekRecap } from "@/lib/week-recap";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await tokenUser(request);
  if (!userId) return unauthorized();
  const recap = await lastWeekRecap(userId);
  return Response.json({ recap, show: showWeekRecap(), url: "/" });
}
