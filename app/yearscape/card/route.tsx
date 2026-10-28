import { ImageResponse } from "next/og";
import { logoSvg } from "@/components/logo";
import { coverUrl, FALLBACK_COVER, getCover } from "@/lib/covers";
import { currentUserId } from "@/lib/session";
import { formatListeningTime, localDay } from "@/lib/time";
import { getYearscape } from "@/lib/yearscape";

export const dynamic = "force-dynamic";

const WIDTH = 1080;
const HEIGHT = 1350;
const GREEN = "#00FF66";
const MUTED = "#8B95A5";
const COLUMN = 448;
const SONG_COVER = 360;
const ARTIST_COVER = 80;
const FALLBACK = `data:image/svg+xml;base64,${Buffer.from(FALLBACK_COVER).toString("base64")}`;
const IMAGE_TYPES = ["image/jpeg", "image/png"];
const MAX_IMAGE_BYTES = 5_000_000;

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

let fonts: Promise<Font[] | undefined> | undefined;

async function googleFont(family: string, weight: 400 | 700, text?: string): Promise<Font> {
  const query = `family=${family.replaceAll(" ", "+")}:wght@${weight}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?${query}`, { signal: AbortSignal.timeout(5000) })
  ).text();
  const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
  if (!url) throw new Error(`No font file for ${family}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Font ${family}: ${response.status}`);
  return { name: family, data: await response.arrayBuffer(), weight, style: "normal" };
}

function loadFonts() {
  fonts ??= Promise.all([googleFont("Geist", 400), googleFont("Space Grotesk", 700, "Soundscape")]).catch(() => {
    fonts = undefined;
    return undefined;
  });
  return fonts;
}

async function coverImage(cover: string): Promise<string | undefined> {
  const local = cover.startsWith(coverUrl(""))
    ? await getCover(decodeURIComponent(cover.slice(coverUrl("").length)))
    : null;
  if (local)
    return IMAGE_TYPES.includes(local.type) ? `data:${local.type};base64,${local.data.toString("base64")}` : undefined;
  if (!/^https:\/\//.test(cover)) return undefined;
  const response = await fetch(cover, { signal: AbortSignal.timeout(5000) });
  const type = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!response.ok || !IMAGE_TYPES.includes(type)) return undefined;
  if (Number(response.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return undefined;
  const data = Buffer.from(await response.arrayBuffer());
  return data.length <= MAX_IMAGE_BYTES ? `data:${type};base64,${data.toString("base64")}` : undefined;
}

async function loadCovers(urls: (string | undefined)[]) {
  const unique = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  const images = await Promise.all(unique.map((url) => coverImage(url).catch(() => undefined)));
  return new Map<string | undefined, string | undefined>(unique.map((url, i) => [url, images[i]]));
}

const line = { display: "flex", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" } as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 456,
        padding: "20px 32px",
        borderRadius: 24,
        background: "rgba(255, 255, 255, 0.06)",
      }}
    >
      <span style={{ fontSize: 30, color: MUTED }}>{label}</span>
      <span style={{ fontSize: 56, color: "#FFFFFF" }}>{value}</span>
    </div>
  );
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Log in to make your Yearscape card" }, { status: 401 });

  const currentYear = Number(localDay(new Date()).slice(0, 4));
  const requested = Number(new URL(request.url).searchParams.get("year"));
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= currentYear ? requested : currentYear;
  const scape = await getYearscape(userId, year);
  const logo = `data:image/svg+xml;base64,${Buffer.from(logoSvg({ tile: false })).toString("base64")}`;
  const topSong = scape.topSongs[0];
  const [loaded, covers] = await Promise.all([
    loadFonts(),
    loadCovers([topSong?.cover, ...scape.topArtists.map((artist) => artist.cover)]),
  ]);

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 72,
        color: "#FFFFFF",
        fontFamily: "Geist",
        background: "radial-gradient(circle at 90% 0%, rgba(0, 255, 102, 0.18), #0A0E14 45%)",
        backgroundColor: "#0A0E14",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <img src={logo} width={72} height={72} alt="" style={{ borderRadius: 16 }} />
        <span style={{ display: "flex", fontFamily: "Space Grotesk, Geist", fontWeight: 700, fontSize: 44 }}>
          Sound<span style={{ color: GREEN }}>scape</span>
        </span>
        <span style={{ ...line, marginLeft: "auto", maxWidth: 480, fontSize: 36, color: MUTED }}>{userId}</span>
      </div>

      <span style={{ marginTop: 48, fontSize: 104, color: GREEN, lineHeight: 1.05 }}>{year} Yearscape</span>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 40 }}>
        <Stat label="Plays" value={scape.plays.toLocaleString("en")} />
        <Stat label="Listening time" value={formatListeningTime(scape.listeningMs)} />
        <Stat label="Artists" value={scape.artists.toLocaleString("en")} />
        <Stat label="New artists" value={scape.newArtists.length.toLocaleString("en")} />
      </div>

      <div style={{ display: "flex", gap: 40, marginTop: 48 }}>
        {topSong && (
          <div style={{ display: "flex", flexDirection: "column", width: COLUMN }}>
            <span style={{ fontSize: 30, color: MUTED }}>Top song</span>
            <img
              src={covers.get(topSong.cover) ?? FALLBACK}
              width={SONG_COVER}
              height={SONG_COVER}
              alt=""
              style={{ marginTop: 16, borderRadius: 24, objectFit: "cover" }}
            />
            <span style={{ ...line, marginTop: 16, fontSize: 48, maxWidth: COLUMN }}>{topSong.title}</span>
            <span style={{ ...line, fontSize: 32, color: MUTED, maxWidth: COLUMN }}>{topSong.artist}</span>
          </div>
        )}

        {scape.topArtists.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", width: COLUMN, gap: 12 }}>
            <span style={{ fontSize: 30, color: MUTED, marginBottom: 4 }}>Top artists</span>
            {scape.topArtists.map((artist, index) => (
              <div key={artist.name} style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <span style={{ width: 28, fontSize: 32, color: GREEN }}>{index + 1}</span>
                <img
                  src={covers.get(artist.cover) ?? FALLBACK}
                  width={ARTIST_COVER}
                  height={ARTIST_COVER}
                  alt=""
                  style={{ borderRadius: artist.photo ? ARTIST_COVER / 2 : 16, objectFit: "cover" }}
                />
                <span style={{ ...line, fontSize: index === 0 ? 40 : 32, maxWidth: COLUMN - ARTIST_COVER - 68 }}>
                  {artist.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: loaded,
      headers: {
        "Content-Disposition": `inline; filename="soundscape-${year}.png"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
