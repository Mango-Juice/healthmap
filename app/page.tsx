import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { MapDiscovery } from "../components/map/map-discovery"
import { PilotDiscovery } from "../components/pilot/pilot-discovery"
import { createPublicCatalogBootstrap } from "../lib/catalog/bootstrap"
import type { PublicCatalog } from "../lib/catalog/repository"
import { getPublicCatalogRuntimeProvider } from "../lib/catalog/runtime"
import { isPublicPilotEnabled } from "../lib/pilot/environment"
import { buildAbsoluteSiteUrl, getRuntimeSiteEnvironment } from "../lib/share-links"
import { type RootSearchParameters, resolveRootRoute } from "./route-seo"

export const dynamic = "force-dynamic"

const rootCanonical = buildAbsoluteSiteUrl("", getRuntimeSiteEnvironment())

export const metadata: Metadata =
  rootCanonical === null || isPublicPilotEnabled(process.env)
    ? {
        description: "전국에서 먹고 싶은 한 끼를 메뉴와 재료로 찾아보세요.",
        robots: { follow: false, index: false },
      }
    : { alternates: { canonical: rootCanonical } }

type HomePageProperties = {
  readonly searchParams: Promise<RootSearchParameters>
}

export default async function HomePage({ searchParams }: HomePageProperties) {
  if (isPublicPilotEnabled(process.env))
    return (
      <main>
        <PilotDiscovery clientId={process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"]} />
      </main>
    )

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

  const shared = route.initialMapState
  const bootstrap = createPublicCatalogBootstrap(
    catalog,
    shared === null
      ? { mode: "regions" }
      : {
          mode: "places",
          query: shared.query,
          filter: shared.tag,
          ingredient: shared.ingredient ?? "all",
          cooking: shared.cooking ?? "all",
          south: shared.appliedBounds.southWest.latitude,
          west: shared.appliedBounds.southWest.longitude,
          north: shared.appliedBounds.northEast.latitude,
          east: shared.appliedBounds.northEast.longitude,
        },
  )

  return (
    <main>
      <MapDiscovery
        clientId={process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"]}
        initialCatalogState={initialCatalogState}
        initialCatalogQuery={bootstrap.query}
        initialMenus={bootstrap.menus}
        initialRegions={bootstrap.regions}
        initialTotal={bootstrap.total}
        initialNextCursor={bootstrap.nextCursor}
        initialMapState={route.initialMapState ?? undefined}
        initialPlaces={bootstrap.places}
      />
    </main>
  )
}
