import { normalizeDiscoveryQuery } from "../domain/discovery"
import { haversineDistanceMeters } from "../domain/distance"
import type { GeoPoint } from "../domain/geo"
import type { DiscoveryCatalog, DiscoveryMenu } from "./catalog"
import { type DiscoveryResult, menusForDiscoveryPlace } from "./menu-selection"

export type DiscoverySortBasis = "map_center" | "region_center" | "catalog_center"

export const discoveryResultBoundsCenter = (
  results: readonly DiscoveryResult[],
): GeoPoint | null => {
  if (results.length === 0) return null
  const latitudes = results.map(({ place }) => place.latitude)
  const longitudes = results.map(({ place }) => place.longitude)
  return {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  }
}

const relevanceRank = (
  catalog: DiscoveryCatalog,
  result: DiscoveryResult,
  normalizedQuery: string,
): number => {
  if (!normalizedQuery) return 0
  const placeName = normalizeDiscoveryQuery(result.place.name)
  if (placeName === normalizedQuery) return 0
  if (placeName.includes(normalizedQuery)) return 1
  const matchingIds = new Set<DiscoveryMenu["id"]>(result.matchingMenuIds)
  if (
    menusForDiscoveryPlace(catalog, result.place.id).some(
      (menu) =>
        matchingIds.has(menu.id) && normalizeDiscoveryQuery(menu.name).includes(normalizedQuery),
    )
  )
    return 2
  return 3
}

export const orderFoodMapResults = (input: {
  readonly catalog: DiscoveryCatalog
  readonly results: readonly DiscoveryResult[]
  readonly normalizedQuery: string
  readonly origin: GeoPoint
}): readonly DiscoveryResult[] =>
  [...input.results].sort((left, right) => {
    const rank =
      relevanceRank(input.catalog, left, input.normalizedQuery) -
      relevanceRank(input.catalog, right, input.normalizedQuery)
    if (rank !== 0) return rank
    const distance =
      haversineDistanceMeters(input.origin, left.place) -
      haversineDistanceMeters(input.origin, right.place)
    return distance || left.place.id.localeCompare(right.place.id)
  })
