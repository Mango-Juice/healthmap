import type { MetadataRoute } from "next"

import { getIndexableSiteUrl } from "../lib/search-indexing.ts"
import { getRuntimeSiteEnvironment } from "../lib/share-links.ts"

// biome-ignore lint/style/noDefaultExport: Next.js metadata convention requires a default export.
export default function robots(): MetadataRoute.Robots {
  const host = getIndexableSiteUrl(getRuntimeSiteEnvironment())
  return host === null
    ? { rules: { userAgent: "*", disallow: "/" } }
    : {
        host,
        rules: { userAgent: "*", allow: "/" },
        sitemap: new URL("sitemap.xml", host).toString(),
      }
}
