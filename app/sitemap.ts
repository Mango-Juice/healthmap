import type { MetadataRoute } from "next"

import { getPublicCatalogRuntimeProvider } from "../lib/catalog/runtime.ts"
import { getRuntimeSiteEnvironment } from "../lib/share-links.ts"
import { buildSitemapEntries } from "./route-seo.ts"

export const dynamic = "force-dynamic"

// biome-ignore lint/style/noDefaultExport: Next.js metadata convention requires a default export.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const catalog = await getPublicCatalogRuntimeProvider().read()
    return buildSitemapEntries(catalog, getRuntimeSiteEnvironment())
  } catch (error) {
    if (error instanceof Error) return []
    throw error
  }
}
