import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BIRION FINANCE",
    short_name: "BIRION",
    description: "Finanças da família em um só lugar.",
    start_url: "/painel",
    display: "standalone",
    background_color: "#f6f9fa",
    theme_color: "#f6f9fa",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
