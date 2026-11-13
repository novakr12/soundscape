import { revokeAuthorization } from "@/lib/tokens";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const revoked = await revokeAuthorization(request.headers.get("authorization"));
  return revoked
    ? new Response(null, { status: 204 })
    : Response.json({ error: "Invalid authorization token." }, { status: 401 });
}
