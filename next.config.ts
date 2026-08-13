import type { NextConfig } from "next"

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
} satisfies NextConfig

export default nextConfig
