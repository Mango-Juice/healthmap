import type { NextConfig } from "next"
import { securityHeadersConfig } from "./lib/security/headers"

const nextConfig = {
  ...securityHeadersConfig(),
  distDir: process.env["PLAYWRIGHT_DIST_DIR"] ?? ".next",
  devIndicators: false,
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
} satisfies NextConfig

export default nextConfig
