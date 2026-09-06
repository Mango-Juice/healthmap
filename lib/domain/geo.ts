export type GeoPoint = { readonly latitude: number; readonly longitude: number }
export type MapView = GeoPoint & { readonly zoom: number }
export const LOCATION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 5000,
  maximumAge: 300000,
} as const
