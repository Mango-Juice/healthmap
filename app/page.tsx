import { MapDiscovery } from "../components/map/map-discovery"
import catalogSource from "../data/catalog.json"
import { PlaceSchema } from "../lib/domain/catalog"

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

  return (
    <main>
      <MapDiscovery
        clientId={process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"]}
        initialPlaces={places}
      />
    </main>
  )
}
