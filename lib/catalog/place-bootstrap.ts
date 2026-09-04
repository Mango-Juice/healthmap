import type { Place, PublicCatalogSnapshot } from "../domain/catalog.ts"
import { createPublicCatalogBootstrap } from "./bootstrap.ts"

export const createPublicPlaceBootstrap = (catalog: PublicCatalogSnapshot, place: Place) => {
  const bounds = {
    southWest: {
      latitude: Math.max(-90, place.latitude - 0.04),
      longitude: Math.max(-180, place.longitude - 0.04),
    },
    northEast: {
      latitude: Math.min(90, place.latitude + 0.04),
      longitude: Math.min(180, place.longitude + 0.04),
    },
  }
  const bootstrap = createPublicCatalogBootstrap(catalog, {
    mode: "places",
    south: bounds.southWest.latitude,
    west: bounds.southWest.longitude,
    north: bounds.northEast.latitude,
    east: bounds.northEast.longitude,
  })
  return { bootstrap, bounds }
}
