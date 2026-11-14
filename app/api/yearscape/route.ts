import { tokenUser, unauthorized } from "@/lib/token-auth";
import { yearscapeReady } from "@/lib/yearscape-ready";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await tokenUser(request);
  if (!userId) return unauthorized();
  return Response.json(await yearscapeReady(userId));
}
