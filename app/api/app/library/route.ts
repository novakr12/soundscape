import { libraryPage, librarySearch, readNode, readQuery } from "@/lib/app-library";
import { NavidromeError } from "@/lib/navidrome";
import { sessionOrTokenUser, unauthorized } from "@/lib/token-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await sessionOrTokenUser(request);
  if (!userId) return unauthorized();
  const params = new URL(request.url).searchParams;
  try {
    if (params.has("search")) {
      const query = readQuery(params.get("search"));
      if (!query) return Response.json({ error: "Send something to search for." }, { status: 400 });
      return Response.json(await librarySearch(userId, query));
    }
    const node = readNode(params.get("node"));
    const page = node ? await libraryPage(userId, node) : null;
    if (!page) return Response.json({ error: "There's nothing here." }, { status: 404 });
    return Response.json(page);
  } catch (error) {
    if (!(error instanceof NavidromeError)) throw error;
    return Response.json({ error: error.message }, { status: 502 });
  }
}
