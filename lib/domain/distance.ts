import type { Place } from "./catalog.ts"
import type { GeoPoint } from "./geo.ts"
import type { ViewportBounds } from "./viewport.ts"

const EARTH_RADIUS_METERS = 6_371_000
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

export type PlaceDistance = {
  readonly place: Place
  readonly distanceMeters: number
}

export type DistanceSortInput = {
  readonly places: readonly Place[]
  readonly appliedBounds: ViewportBounds
  readonly userLocation?: GeoPoint
}

export const getViewportCenter = (bounds: ViewportBounds): GeoPoint => ({
  latitude: (bounds.southWest.latitude + bounds.northEast.latitude) / 2,
  longitude: (bounds.southWest.longitude + bounds.northEast.longitude) / 2,
})

export const haversineDistanceMeters = (from: GeoPoint, to: GeoPoint): number => {
  const latitudeDifference = toRadians(to.latitude - from.latitude)
  const longitudeDifference = toRadians(to.longitude - from.longitude)
  const fromLatitude = toRadians(from.latitude)
  const toLatitude = toRadians(to.latitude)
  const halfChord =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDifference / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(halfChord), Math.sqrt(1 - halfChord))
}

const comparePlaceDistances = (left: PlaceDistance, right: PlaceDistance): number => {
  const distanceDifference = left.distanceMeters - right.distanceMeters
  if (distanceDifference !== 0) return distanceDifference
  const nameDifference = left.place.name.localeCompare(right.place.name, "ko-KR")
  return nameDifference === 0 ? left.place.id.localeCompare(right.place.id) : nameDifference
}

export const sortPlacesByDistance = ({
  places,
  appliedBounds,
  userLocation,
}: DistanceSortInput): readonly PlaceDistance[] => {
  const origin = userLocation ?? getViewportCenter(appliedBounds)
  return places
    .map((place) => ({
      place,
      distanceMeters: haversineDistanceMeters(origin, {
        latitude: place.latitude,
        longitude: place.longitude,
      }),
    }))
    .sort(comparePlaceDistances)
}
