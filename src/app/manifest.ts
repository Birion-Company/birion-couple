import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Birion Finance",
    short_name: "Birion",
    description: "Finanças da família em um só lugar.",
    start_url: "/painel",
    display: "standalone",
    background_color: "#fbf6f0",
    theme_color: "#fbf6f0",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
