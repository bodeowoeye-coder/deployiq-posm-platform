/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep local development output separate from production builds so one
  // process cannot invalidate the other's generated CSS and route assets.
  distDir: process.env.NEXT_DIST_DIR ?? (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co"
      }
    ]
  }
};

export default nextConfig;
