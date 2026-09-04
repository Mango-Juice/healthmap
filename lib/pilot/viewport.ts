import type { GeoPoint, MapView } from "../domain/geo"
import type { ViewportBounds } from "../domain/viewport"

export const PILOT_START_VIEW: MapView = { latitude: 37.57, longitude: 126.979, zoom: 14 }
export const PILOT_NATIONAL_VIEW: MapView = { latitude: 36.3, longitude: 127.8, zoom: 7 }

export const pilotBoundsAround = (point: GeoPoint): ViewportBounds => ({
  southWest: { latitude: point.latitude - 0.018, longitude: point.longitude - 0.023 },
  northEast: { latitude: point.latitude + 0.018, longitude: point.longitude + 0.023 },
})
