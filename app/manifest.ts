import type { MetadataRoute } from "next";

const iconVersion = "20260612";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DeployIQ™",
    short_name: "DeployIQ",
    description: "Execute. Track. Verify.",
    start_url: "/",
    display: "standalone",
    background_color: "#02081f",
    theme_color: "#02081f",
    icons: [
      { src: `/icons/icon-192.png?v=${iconVersion}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/icons/icon-512.png?v=${iconVersion}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/icons/icon-192.png?v=${iconVersion}`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `/icons/icon-512.png?v=${iconVersion}`, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
