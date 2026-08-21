import { MapDiscovery } from "../components/map/map-discovery"
import type { PublicCatalog } from "../lib/catalog/repository"
import { getPublicCatalogRuntimeProvider } from "../lib/catalog/runtime"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  let catalog: PublicCatalog = { menus: [], places: [] }
  let initialCatalogState: "ready" | "error" = "ready"
  try {
    catalog = await getPublicCatalogRuntimeProvider().read()
  } catch {
    initialCatalogState = "error"
  }

  return (
    <main>
      <MapDiscovery
        clientId={process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"]}
        initialCatalogState={initialCatalogState}
        initialMenus={catalog.menus}
        initialPlaces={catalog.places}
      />
    </main>
  )
}
