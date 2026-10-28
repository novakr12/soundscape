import { NextResponse } from "next/server";
import { userForAuthorization } from "@/lib/tokens";

export async function GET(request: Request) {
  const queryToken = new URL(request.url).searchParams.get("token");
  const header = request.headers.get("authorization") ?? (queryToken ? `Token ${queryToken}` : null);
  if (!header) {
    return NextResponse.json({ code: 400, error: "You need to provide an Authorization header." }, { status: 400 });
  }

  const userId = await userForAuthorization(header);
  return NextResponse.json(
    userId
      ? { code: 200, message: "Token valid.", valid: true, user_name: userId }
      : { code: 200, message: "Token invalid.", valid: false },
  );
}
