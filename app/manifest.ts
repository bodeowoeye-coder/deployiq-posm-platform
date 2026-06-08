import type { MetadataRoute } from "next";

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
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
