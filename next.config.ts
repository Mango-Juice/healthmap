import type { NextConfig } from "next"
import { securityHeadersConfig } from "./lib/security/headers"

const nextConfig = {
  ...securityHeadersConfig(),
  distDir: process.env["PLAYWRIGHT_DIST_DIR"] ?? ".next",
  devIndicators: false,
  images: {
    remotePatterns: [new URL("https://slowcali.co.kr/synthetic-0e9fbf3c3b/images/**")],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
} satisfies NextConfig

export default nextConfig
