import type { GeoPoint, MapView } from "../domain/geo"

export type MapAdapterState = "fallback" | "loading" | "ready" | "error"

export type NaverMap = {
  readonly destroy?: () => void
  readonly setCenter: (point: NaverLatLng) => void
  readonly setZoom: (zoom: number) => void
}
export type MapContainer = { readonly dataset: DOMStringMap }
export type NaverLatLng = object
export type NaverMapsApi = {
  readonly LatLng: new (latitude: number, longitude: number) => NaverLatLng
  readonly Map: new (
    container: MapContainer,
    options: { readonly center: NaverLatLng; readonly zoom: number },
  ) => NaverMap
}

declare global {
  interface Window {
    naver?: { readonly maps?: NaverMapsApi }
  }
}

export interface MapAdapter {
  destroy(): void
  recenter(point: GeoPoint, zoom: number): void
}

export const createNaverMapAdapter = (
  container: MapContainer,
  view: MapView,
  injectedMaps?: NaverMapsApi,
): MapAdapter => {
  const maps = injectedMaps ?? window.naver?.maps
  if (!maps) throw new MapSdkLoadError("NAVER Maps constructor is unavailable")
  const map = new maps.Map(container, {
    center: new maps.LatLng(view.latitude, view.longitude),
    zoom: view.zoom,
  })
  container.dataset["mapConstructed"] = "true"
  return {
    destroy: () => {
      map.destroy?.()
      delete container.dataset["mapConstructed"]
    },
    recenter: (point, zoom) => {
      map.setCenter(new maps.LatLng(point.latitude, point.longitude))
      map.setZoom(zoom)
    },
  }
}

export const loadNaverMaps = (clientId: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (window.naver?.maps) return resolve()
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-health-map-sdk="naver"]',
    )
    existing?.remove()
    const script = document.createElement("script")
    script.dataset["healthMapSdk"] = "naver"
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`
    script.async = true
    script.onload = () =>
      window.naver?.maps
        ? resolve()
        : reject(new MapSdkLoadError("NAVER Maps constructor is unavailable"))
    script.onerror = () => reject(new MapSdkLoadError("NAVER Maps SDK failed to load"))
    document.head.append(script)
  })

export class MapSdkLoadError extends Error {
  readonly name = "MapSdkLoadError"
  constructor(message: string) {
    super(message)
  }
}

export const viewLabel = (view: MapView): string =>
  `${view.latitude.toFixed(4)}, ${view.longitude.toFixed(4)} · 확대 ${view.zoom}`
