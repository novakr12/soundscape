import { ImageResponse } from "next/og";
import { logoSvg } from "@/components/logo";
import { nowPlaying } from "@/lib/now-playing";
import { FALLBACK, line, loadCovers, loadFontsWithBold } from "@/lib/og";
import { formatTimeAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

const WIDTH = 880;
const HEIGHT = 220;
const COVER = 172;

const THEMES = {
  dark: { background: "#0A0E14", text: "#F2F5F8", muted: "#8B95A5", accent: "#00FF66", border: "#1E2631" },
  light: { background: "#FFFFFF", text: "#11161D", muted: "#5B6573", accent: "#05A84C", border: "#E3E7EC" },
};

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const theme = THEMES[new URL(request.url).searchParams.get("theme") === "light" ? "light" : "dark"];
  const playing = await nowPlaying(username);
  const song = playing.state === "now" || playing.state === "last" ? playing : null;
  const [fonts, covers] = await Promise.all([loadFontsWithBold(), loadCovers([song?.cover])]);
  const logo = `data:image/svg+xml;base64,${Buffer.from(logoSvg({ tile: false })).toString("base64")}`;

  const label = !song
    ? null
    : song.state === "now"
      ? "Listening now"
      : `Last played${song.at ? ` · ${formatTimeAgo(song.at)}` : ""}`;
  const fallbackText =
    playing.state === "private"
      ? "This profile is private"
      : playing.state === "missing"
        ? "No such listener"
        : "Nothing played yet";

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        gap: 28,
        padding: 24,
        background: theme.background,
        border: `2px solid ${theme.border}`,
        borderRadius: 24,
        fontFamily: "Geist",
        color: theme.text,
      }}
    >
      {song ? (
        <img
          alt=""
          src={covers.get(song.cover) ?? FALLBACK}
          width={COVER}
          height={COVER}
          style={{ borderRadius: 16, objectFit: "cover" }}
        />
      ) : (
        <img alt="" src={logo} width={COVER} height={COVER} style={{ padding: 28 }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 6 }}>
        {label && (
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, color: theme.muted }}>
            {song?.state === "now" && (
              <span style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: theme.accent }} />
            )}
            {label}
          </span>
        )}
        <span style={{ ...line, fontSize: song ? 46 : 40, fontWeight: 700 }}>{song ? song.title : fallbackText}</span>
        {song && <span style={{ ...line, fontSize: 32, color: theme.muted }}>{song.artist}</span>}
        <span
          style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 22, color: theme.muted }}
        >
          <img alt="" src={logo} width={26} height={26} />
          {playing.state !== "missing" && <span style={{ ...line }}>{username} on</span>}
          <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, color: theme.text }}>Soundscape</span>
        </span>
      </div>
    </div>,
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: { "cache-control": "no-cache, no-store, max-age=0", expires: "0" },
      status: playing.state === "missing" ? 404 : 200,
    },
  );
}
