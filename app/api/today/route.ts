import { today } from "@/lib/today";
import { tokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await tokenUser(request);
  if (!userId) return unauthorized();
  return Response.json(await today(userId));
}
