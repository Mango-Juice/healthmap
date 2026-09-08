import type { MetadataRoute } from "next"

import { getIndexableSiteUrl } from "../lib/search-indexing.ts"
import { getRuntimeSiteEnvironment } from "../lib/share-links.ts"

// biome-ignore lint/style/noDefaultExport: Next.js metadata convention requires a default export.
export default function sitemap(): MetadataRoute.Sitemap {
  const url = getIndexableSiteUrl(getRuntimeSiteEnvironment())
  return url === null ? [] : [{ url }]
}
