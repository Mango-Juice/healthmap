import type { Place } from "./catalog"

export type DirectionsTarget =
  | { readonly kind: "route"; readonly latitude: number; readonly longitude: number }
  | { readonly kind: "place" }

export type ProductionDirections = {
  readonly kind: DirectionsTarget["kind"]
  readonly source: "naver_route" | "naver_place"
  readonly url: string
}

const isFiniteCoordinate = (value: number): boolean => Number.isFinite(value)

export const buildProductionDirections = (
  place: Place,
  target: DirectionsTarget = {
    kind: "route",
    latitude: place.latitude,
    longitude: place.longitude,
  },
): ProductionDirections | undefined => {
  if (place.dataMode !== "production") return undefined
  if (
    target.kind === "route" &&
    isFiniteCoordinate(target.latitude) &&
    isFiniteCoordinate(target.longitude)
  ) {
    const destination = `${target.longitude},${target.latitude},place,${encodeURIComponent(place.name)}`
    return {
      kind: "route",
      source: "naver_route",
      url: `https://map.naver.com/p/directions/${destination}/-/walk`,
    }
  }
  return { kind: "place", source: "naver_place", url: place.naverPlaceUrl }
}
