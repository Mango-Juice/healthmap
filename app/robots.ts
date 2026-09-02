import type { MetadataRoute } from "next"

import { buildAbsoluteSiteUrl, getRuntimeSiteEnvironment } from "../lib/share-links.ts"

// biome-ignore lint/style/noDefaultExport: Next.js metadata convention requires a default export.
export default function robots(): MetadataRoute.Robots {
  const environment = getRuntimeSiteEnvironment()
  const sitemap = buildAbsoluteSiteUrl("sitemap.xml", environment)
  const host = buildAbsoluteSiteUrl("", environment)
  return sitemap === null || host === null
    ? { rules: { userAgent: "*", disallow: "/" } }
    : { host, rules: { userAgent: "*", allow: "/" }, sitemap }
}
