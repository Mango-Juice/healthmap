import type { GeoPoint } from "./geo.ts"

const EARTH_RADIUS_METERS = 6_371_000
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

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
