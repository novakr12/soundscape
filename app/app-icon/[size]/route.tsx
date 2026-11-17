import { ImageResponse } from "next/og";
import { logoSvg } from "@/components/logo";

export const dynamic = "force-static";

const SIZES = new Set([192, 512]);

export function generateStaticParams() {
  return [...SIZES].map((size) => ({ size: String(size) }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const svg = `data:image/svg+xml;base64,${Buffer.from(logoSvg({ tile: false, id: "app" })).toString("base64")}`;
  return new ImageResponse(<img src={svg} width={size} height={size} alt="" />, { width: size, height: size });
}
