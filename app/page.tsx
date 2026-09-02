import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { MapDiscovery } from "../components/map/map-discovery"
import type { PublicCatalog } from "../lib/catalog/repository"
import { getPublicCatalogRuntimeProvider } from "../lib/catalog/runtime"
import { buildAbsoluteSiteUrl, getRuntimeSiteEnvironment } from "../lib/share-links"
import { type RootSearchParameters, resolveRootRoute } from "./route-seo"

export const dynamic = "force-dynamic"

const rootCanonical = buildAbsoluteSiteUrl("", getRuntimeSiteEnvironment())

export const metadata: Metadata =
  rootCanonical === null
    ? { robots: { follow: false, index: false } }
    : { alternates: { canonical: rootCanonical } }

type HomePageProperties = {
  readonly searchParams: Promise<RootSearchParameters>
}

export default async function HomePage({ searchParams }: HomePageProperties) {
  let catalog: PublicCatalog = {
    catalogVersion: "unavailable",
    dataMode: "production",
    menus: [],
    places: [],
  }
  let initialCatalogState: "ready" | "error" = "ready"
  try {
    catalog = await getPublicCatalogRuntimeProvider().read()
  } catch {
    initialCatalogState = "error"
  }

  const route = resolveRootRoute(await searchParams, catalog)
  if (route.kind === "redirect") redirect(route.destination)

  return (
    <main>
      <MapDiscovery
        clientId={process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"]}
        initialCatalogState={initialCatalogState}
        initialMenus={catalog.menus}
        initialMapState={route.initialMapState ?? undefined}
        initialPlaces={catalog.places}
      />
    </main>
  )
}
