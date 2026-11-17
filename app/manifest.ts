import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Soundscape",
    short_name: "Soundscape",
    description: "Play history, recommendations and live charts.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0A0E14",
    theme_color: "#0A0E14",
    categories: ["music", "entertainment"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Music", url: "/music" },
      { name: "History", url: "/history" },
      { name: "Recommendations", url: "/recommendations" },
    ],
  };
}
