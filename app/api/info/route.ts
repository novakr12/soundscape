import { signupMode } from "@/lib/signups";
import { version } from "@/package.json";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ app: "soundscape", version, api: 1, signups: signupMode() });
}
