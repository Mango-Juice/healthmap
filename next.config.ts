import type { NextConfig } from "next"
import { securityHeadersConfig } from "./lib/security/headers"

const nextConfig = {
  ...securityHeadersConfig(),
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
} satisfies NextConfig

export default nextConfig
