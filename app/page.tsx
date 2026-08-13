import { MapDiscovery } from "../components/map/map-discovery"
import catalogSource from "../data/catalog.json"
import { MenuSchema, PlaceSchema } from "../lib/domain/catalog"

export default function HomePage() {
  const places = catalogSource.places.map((entry) =>
    PlaceSchema.parse({
      address: entry.address,
      dataMode: catalogSource.data_mode,
      healthTags: entry.health_tags,
      id: entry.id,
      latitude: entry.latitude,
      longitude: entry.longitude,
      name: entry.name,
      naverPlaceUrl: entry.naver_place_url,
      primaryTag: entry.primary_tag,
      published: entry.published,
      slug: entry.slug,
    }),
  )
  const menus = catalogSource.places.flatMap((place) =>
    place.menus.map((menu) =>
      MenuSchema.parse({
        dataMode: catalogSource.data_mode,
        displayOrder: menu.display_order,
        evidenceUrl: menu.evidence_url,
        healthTags: menu.health_tags,
        id: menu.id,
        name: menu.name,
        placeId: place.id,
        published: menu.published,
        verifiedAt: menu.verified_at,
      }),
    ),
  )

  return (
    <main>
      <MapDiscovery
        clientId={process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"]}
        initialMenus={menus}
        initialPlaces={places}
      />
    </main>
  )
}
