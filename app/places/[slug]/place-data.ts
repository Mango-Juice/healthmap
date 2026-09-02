import { cache } from "react"

import { getPublicCatalogRuntimeProvider } from "../../../lib/catalog/runtime.ts"
import { resolvePublishedPlace } from "../../route-seo.ts"

export const getPublishedPlaceRouteData = cache(async (slug: string) => {
  const catalog = await getPublicCatalogRuntimeProvider().read()
  const place = resolvePublishedPlace(catalog, slug)
  return place === null ? null : { catalog, place }
})
