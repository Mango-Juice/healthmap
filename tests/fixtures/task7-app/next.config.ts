import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  distDir: process.env["TASK7_FIXTURE_DIST_DIR"] ?? ".next",
  experimental: { externalDir: true },
}

// biome-ignore lint/style/noDefaultExport: Next configuration files are default-exported framework entrypoints.
export default nextConfig
