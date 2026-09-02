import type { GeoPoint, MapView } from "../domain/geo"
import type { ViewportBounds } from "../domain/viewport"

export type MapAdapterState = "loading" | "ready" | "error"

export type NaverMap = {
  readonly destroy?: () => void
  readonly getBounds?: () => {
    readonly getNE: () => NaverLatLng
    readonly getSW: () => NaverLatLng
  }
  readonly getCenter?: () => NaverLatLng
  readonly getZoom?: () => number
  readonly setCenter: (point: NaverLatLng) => void
  readonly setZoom: (zoom: number) => void
}
export type MapContainer = { readonly dataset: DOMStringMap }
export type NaverLatLng = object
export type NaverMapListener = object
export type NaverMarker = {
  readonly setMap: (map: NaverMap | null) => void
}
export type NaverMapsApi = {
  readonly Event: {
    readonly addListener: (
      target: object,
      eventName: string,
      listener: () => void,
    ) => NaverMapListener
    readonly removeListener: (listener: NaverMapListener) => void
  }
  readonly LatLng: new (latitude: number, longitude: number) => NaverLatLng
  readonly Map: new (
    container: MapContainer,
    options: { readonly center: NaverLatLng; readonly zoom: number },
  ) => NaverMap
  readonly Marker: new (options: {
    readonly clickable: boolean
    readonly map: NaverMap
    readonly position: NaverLatLng
    readonly title: string
  }) => NaverMarker
}

declare global {
  interface Window {
    naver?: { readonly maps?: NaverMapsApi }
    navermap_authFailure?: (() => void) | undefined
  }
}

export interface MapAdapter {
  destroy(): void
  recenter(point: GeoPoint, zoom: number): void
  syncMarkers(markers: readonly MapMarkerSpec[]): void
  teardownAfterProviderFailure(): void
  waitUntilReady(): Promise<void>
}

export type MapViewportSnapshot = {
  readonly bounds: ViewportBounds
  readonly view: MapView
}

const readLatitude = (point: NaverLatLng | undefined): number | undefined => {
  if (point === undefined || !("lat" in point) || typeof point.lat !== "function") return undefined
  const value: unknown = point.lat()
  return typeof value === "number" ? value : undefined
}

const readLongitude = (point: NaverLatLng | undefined): number | undefined => {
  if (point === undefined || !("lng" in point) || typeof point.lng !== "function") return undefined
  const value: unknown = point.lng()
  return typeof value === "number" ? value : undefined
}

export type MapMarkerSpec = {
  readonly label: string
  readonly latitude: number
  readonly longitude: number
  readonly onSelect: () => void
}

export type SdkScript = {
  addEventListener(type: "load" | "error", listener: () => void): void
  async: boolean
  readonly dataset: DOMStringMap
  src: string
  remove(): void
}
export type SdkLoaderHost = {
  append(script: SdkScript): void
  createScript(): SdkScript
  getMaps(): NaverMapsApi | undefined
  queryScript(): SdkScript | undefined
}
export type SdkLoader = { cancel(): void; load(clientId: string): Promise<void> }

export const createSdkLoader = (host: SdkLoaderHost): SdkLoader => {
  let generation = 0
  let pending: Promise<void> | undefined
  return {
    cancel: () => {
      generation += 1
      pending = undefined
      host.queryScript()?.remove()
    },
    load: (clientId) => {
      if (host.getMaps()) return Promise.resolve()
      if (pending) return pending
      const requestGeneration = generation
      host.queryScript()?.remove()
      const script = host.createScript()
      script.dataset["healthMapSdk"] = "naver"
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`
      script.async = true
      pending = new Promise((resolve, reject) => {
        const fail = (message: string) => {
          if (requestGeneration !== generation) return
          script.remove()
          pending = undefined
          reject(new MapSdkLoadError(message))
        }
        script.addEventListener("load", () =>
          host.getMaps() ? resolve() : fail("NAVER Maps constructor is unavailable"),
        )
        script.addEventListener("error", () => fail("NAVER Maps SDK failed to load"))
        host.append(script)
      })
      return pending
    },
  }
}

export const createNaverMapAdapter = (
  container: MapContainer,
  view: MapView,
  injectedMaps?: NaverMapsApi,
  onViewportChanged?: (snapshot: MapViewportSnapshot) => void,
): MapAdapter => {
  const maps = injectedMaps ?? window.naver?.maps
  if (!maps) throw new MapSdkLoadError("NAVER Maps constructor is unavailable")
  const map = new maps.Map(container, {
    center: new maps.LatLng(view.latitude, view.longitude),
    zoom: view.zoom,
  })
  let markers: Array<{
    readonly listener: NaverMapListener
    readonly marker: NaverMarker
  }> = []
  const clearMarkers = (removeNativeListeners: boolean): void => {
    for (const entry of markers) {
      if (removeNativeListeners) maps.Event.removeListener(entry.listener)
      entry.marker.setMap(null)
    }
    markers = []
  }
  let readinessListener: NaverMapListener | undefined
  const viewportListener = maps.Event.addListener(map, "idle", () => {
    if (onViewportChanged === undefined) return
    const bounds = map.getBounds?.()
    const center = map.getCenter?.()
    const zoom = map.getZoom?.()
    const southWest = bounds?.getSW()
    const northEast = bounds?.getNE()
    const south = readLatitude(southWest)
    const west = readLongitude(southWest)
    const north = readLatitude(northEast)
    const east = readLongitude(northEast)
    const latitude = readLatitude(center)
    const longitude = readLongitude(center)
    if (
      south === undefined ||
      west === undefined ||
      north === undefined ||
      east === undefined ||
      latitude === undefined ||
      longitude === undefined ||
      zoom === undefined
    )
      return
    onViewportChanged({
      bounds: {
        northEast: { latitude: north, longitude: east },
        southWest: { latitude: south, longitude: west },
      },
      view: { latitude, longitude, zoom },
    })
  })
  const readiness = new Promise<void>((resolve) => {
    readinessListener = maps.Event.addListener(map, "tilesloaded", () => {
      if (readinessListener !== undefined) maps.Event.removeListener(readinessListener)
      readinessListener = undefined
      resolve()
    })
  })
  container.dataset["mapConstructed"] = "true"
  let destroyed = false
  const teardown = (nativeListenersAreValid: boolean): void => {
    if (destroyed) return
    clearMarkers(nativeListenersAreValid)
    if (nativeListenersAreValid && readinessListener !== undefined)
      maps.Event.removeListener(readinessListener)
    if (nativeListenersAreValid) maps.Event.removeListener(viewportListener)
    readinessListener = undefined
    map.destroy?.()
    delete container.dataset["mapConstructed"]
    destroyed = true
  }
  return {
    destroy: () => teardown(true),
    recenter: (point, zoom) => {
      map.setCenter(new maps.LatLng(point.latitude, point.longitude))
      map.setZoom(zoom)
    },
    syncMarkers: (specs) => {
      clearMarkers(true)
      markers = specs.map((spec) => {
        const marker = new maps.Marker({
          clickable: true,
          map,
          position: new maps.LatLng(spec.latitude, spec.longitude),
          title: spec.label,
        })
        return {
          listener: maps.Event.addListener(marker, "click", spec.onSelect),
          marker,
        }
      })
    },
    teardownAfterProviderFailure: () => teardown(false),
    waitUntilReady: () => readiness,
  }
}

export const subscribeToNaverMapsAuthFailure = (listener: () => void): (() => void) => {
  const previousListener = window.navermap_authFailure
  window.navermap_authFailure = listener
  return () => {
    if (window.navermap_authFailure !== listener) return
    if (previousListener === undefined) delete window.navermap_authFailure
    else window.navermap_authFailure = previousListener
  }
}

const browserSdkLoader = createSdkLoader({
  append: (script) => document.head.append(script as HTMLScriptElement),
  createScript: () => document.createElement("script"),
  getMaps: () => window.naver?.maps,
  queryScript: () =>
    document.querySelector<HTMLScriptElement>('script[data-health-map-sdk="naver"]') ?? undefined,
})
export const loadNaverMaps = (clientId: string): Promise<void> => browserSdkLoader.load(clientId)
export const cancelNaverMapsLoad = (): void => browserSdkLoader.cancel()
export const resetNaverMapsLoad = (): void => {
  browserSdkLoader.cancel()
  delete window.naver
}

export class MapSdkLoadError extends Error {
  readonly name = "MapSdkLoadError"
}

export const viewLabel = (view: MapView): string =>
  `${view.latitude.toFixed(4)}, ${view.longitude.toFixed(4)} · 확대 ${view.zoom}`
