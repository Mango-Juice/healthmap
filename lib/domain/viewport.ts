import type { GeoPoint } from "./geo.ts"

export type ViewportBounds = {
  readonly southWest: GeoPoint
  readonly northEast: GeoPoint
}
