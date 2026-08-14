import { MapDiscovery } from "../components/map/map-discovery"
import { getMockCatalog, getPublicCatalogRuntimeProvider } from "../lib/catalog/runtime"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const fallback = getMockCatalog()
  let catalog = fallback
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
