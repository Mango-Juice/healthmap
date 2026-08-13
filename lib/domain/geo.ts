export type GeoPoint = { readonly latitude: number; readonly longitude: number }
export type MapView = GeoPoint & { readonly zoom: number }
export type LocationState =
  | { readonly kind: "requesting" }
  | {
      readonly kind: "inside"
      readonly point: GeoPoint
      readonly recenter: true
      readonly marker: true
    }
  | { readonly kind: "outside"; readonly recenter: false; readonly marker: false }
  | { readonly kind: "denied"; readonly recenter: false; readonly marker: false }
  | { readonly kind: "timeout"; readonly recenter: false; readonly marker: false }
  | { readonly kind: "unsupported"; readonly recenter: false; readonly marker: false }

export type BrowserLocationOutcome =
  | { readonly kind: "success"; readonly point: GeoPoint }
  | { readonly kind: "error"; readonly code: number }
  | { readonly kind: "unsupported" }

export const DEFAULT_VIEW: MapView = { latitude: 37.5007, longitude: 127.0328, zoom: 15 }
export const DISPLAY_BOUNDS = {
  southWest: { latitude: 37.492, longitude: 127.02 },
  northEast: { latitude: 37.5085, longitude: 127.0445 },
} as const
export const LOCATION_BOUNDS = {
  southWest: { latitude: 37.482, longitude: 127.01 },
  northEast: { latitude: 37.5185, longitude: 127.0545 },
} as const
export const LOCATION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 5000,
  maximumAge: 300000,
} as const

const isInsideBounds = (
  point: GeoPoint,
  bounds: { readonly southWest: GeoPoint; readonly northEast: GeoPoint },
): boolean =>
  point.latitude >= bounds.southWest.latitude &&
  point.latitude <= bounds.northEast.latitude &&
  point.longitude >= bounds.southWest.longitude &&
  point.longitude <= bounds.northEast.longitude

export const isInsideDisplayBounds = (point: GeoPoint): boolean =>
  isInsideBounds(point, DISPLAY_BOUNDS)
export const isInsideLocationBounds = (point: GeoPoint): boolean =>
  isInsideBounds(point, LOCATION_BOUNDS)
export const beginLocationRequest = (): LocationState => ({ kind: "requesting" })

export const resolveLocationOutcome = (outcome: BrowserLocationOutcome): LocationState => {
  switch (outcome.kind) {
    case "success":
      return isInsideLocationBounds(outcome.point)
        ? { kind: "inside", point: outcome.point, recenter: true, marker: true }
        : { kind: "outside", recenter: false, marker: false }
    case "error":
      return outcome.code === 1
        ? { kind: "denied", recenter: false, marker: false }
        : { kind: "timeout", recenter: false, marker: false }
    case "unsupported":
      return { kind: "unsupported", recenter: false, marker: false }
    default:
      return assertNever(outcome)
  }
}

const assertNever = (value: never): never => value
