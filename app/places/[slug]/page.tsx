import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { MapDiscovery } from "../../../components/map/map-discovery"
import { createPublicPlaceBootstrap } from "../../../lib/catalog/place-bootstrap"
import { getRuntimeSiteEnvironment } from "../../../lib/share-links.ts"
import { buildPlaceMetadata } from "../../route-seo.ts"
import { getPublishedPlaceRouteData } from "./place-data.ts"

export const dynamic = "force-dynamic"

type PlacePageProperties = {
  readonly params: Promise<{ readonly slug: string }>
}

export const generateMetadata = async ({ params }: PlacePageProperties): Promise<Metadata> => {
  const routeData = await getPublishedPlaceRouteData((await params).slug)
  if (routeData === null) notFound()
  return buildPlaceMetadata(routeData.place, routeData.catalog.menus, getRuntimeSiteEnvironment())
}

// biome-ignore lint/style/noDefaultExport: Next.js page convention requires a default export.
export default async function PlacePage({ params }: PlacePageProperties) {
  const routeData = await getPublishedPlaceRouteData((await params).slug)
  if (routeData === null) notFound()

  const { bootstrap, bounds } = createPublicPlaceBootstrap(routeData.catalog, routeData.place)

  return (
    <main>
      <MapDiscovery
        clientId={process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"]}
        initialCatalogState="ready"
        initialMenus={bootstrap.menus}
        initialPlaces={bootstrap.places}
        initialSelectedPlace={routeData.place}
        initialRegions={bootstrap.regions}
        initialTotal={bootstrap.total}
        initialNextCursor={bootstrap.nextCursor}
        initialCatalogQuery={bootstrap.query}
        initialMapState={{
          center: { latitude: routeData.place.latitude, longitude: routeData.place.longitude },
          zoom: 15,
          appliedBounds: bounds,
          query: "",
          tag: "all",
        }}
        initialSelectedSlug={routeData.place.slug}
        initialSelectionSource="shared_link"
      />
    </main>
  )
}
