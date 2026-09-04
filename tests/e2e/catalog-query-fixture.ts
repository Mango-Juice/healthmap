import type { BrowserContext, Page, Route } from "@playwright/test"
import { queryPublicCatalog } from "../../lib/catalog/query"
import { parsePublicCatalogQuery } from "../../lib/catalog/query-contract"
import type { PublicCatalogSnapshot } from "../../lib/domain/catalog"
import { e2eCatalog } from "../fixtures/e2e-catalog"

export const catalogQueryPattern = "**/api/map-catalog/query?*"
export const emptyQueryCatalog: PublicCatalogSnapshot = {
  ...e2eCatalog,
  catalogVersion: "empty-e2e",
  menus: [],
  places: [],
}

export const fulfillCatalogQuery = async (
  route: Route,
  catalog: PublicCatalogSnapshot = e2eCatalog,
): Promise<void> => {
  const parsed = parsePublicCatalogQuery(new URL(route.request().url()).searchParams)
  if (!parsed.success) throw new TypeError("Invalid E2E catalog query")
  const response = queryPublicCatalog(catalog, parsed.data)
  await route.fulfill({
    status: "error" in response ? 400 : 200,
    contentType: "application/json",
    json: response,
  })
}

export const installCatalogQueryRoutes = async (
  target: BrowserContext | Page,
  catalog: PublicCatalogSnapshot = e2eCatalog,
): Promise<void> => {
  await target.route(catalogQueryPattern, (route) => fulfillCatalogQuery(route, catalog))
  await target.route("**/api/map-catalog/places/*", async (route) => {
    const slug = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) ?? "")
    const place = catalog.places.find((entry) => entry.slug === slug && entry.published)
    await route.fulfill({
      status: place === undefined ? 404 : 200,
      contentType: "application/json",
      json:
        place === undefined
          ? {}
          : {
              catalogVersion: catalog.catalogVersion,
              dataMode: catalog.dataMode,
              place,
              menus: catalog.menus.filter((menu) => menu.placeId === place.id),
            },
    })
  })
}
