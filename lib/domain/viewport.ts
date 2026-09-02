import type { GeoPoint } from "./geo.ts"

export type ViewportBounds = {
  readonly southWest: GeoPoint
  readonly northEast: GeoPoint
}

export type ViewportState = {
  readonly currentBounds: ViewportBounds
  readonly appliedBounds: ViewportBounds
}

export const isInsideViewportBounds = (point: GeoPoint, bounds: ViewportBounds): boolean =>
  point.latitude >= bounds.southWest.latitude &&
  point.latitude <= bounds.northEast.latitude &&
  point.longitude >= bounds.southWest.longitude &&
  point.longitude <= bounds.northEast.longitude

export const createViewportState = (initialBounds: ViewportBounds): ViewportState => ({
  currentBounds: initialBounds,
  appliedBounds: initialBounds,
})

export const recordViewportMovement = (
  state: ViewportState,
  currentBounds: ViewportBounds,
): ViewportState => ({ ...state, currentBounds })

export const applyCurrentViewport = (state: ViewportState): ViewportState => ({
  currentBounds: state.currentBounds,
  appliedBounds: state.currentBounds,
})
