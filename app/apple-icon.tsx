import { ImageResponse } from "next/og";
import { logoSvg } from "@/components/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const svg = `data:image/svg+xml;base64,${Buffer.from(logoSvg({ tile: false })).toString("base64")}`;
  return new ImageResponse(<img src={svg} width={180} height={180} alt="" />, size);
}
