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

type NaverRouteDestination = {
  readonly latitude: number
  readonly longitude: number
  readonly name: string
}

export const buildNaverRouteDirections = ({
  latitude,
  longitude,
  name,
}: NaverRouteDestination): ProductionDirections | undefined => {
  if (!isFiniteCoordinate(latitude) || !isFiniteCoordinate(longitude)) return undefined
  const query = new URLSearchParams({
    elng: String(longitude),
    elat: String(latitude),
    etext: name,
    menu: "route",
  })
  return {
    kind: "route",
    source: "naver_route",
    url: `https://map.naver.com/index.nhn?${query.toString()}`,
  }
}

export const buildProductionDirections = (
  place: Place,
  target: DirectionsTarget = {
    kind: "route",
    latitude: place.latitude,
    longitude: place.longitude,
  },
): ProductionDirections | undefined => {
  if (target.kind === "route") {
    const route = buildNaverRouteDirections({
      latitude: target.latitude,
      longitude: target.longitude,
      name: place.name,
    })
    if (route !== undefined) return route
  }
  return { kind: "place", source: "naver_place", url: place.naverPlaceUrl }
}
