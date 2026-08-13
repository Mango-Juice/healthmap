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

const browserSdkLoader = createSdkLoader({
  append: (script) => document.head.append(script as HTMLScriptElement),
  createScript: () => document.createElement("script"),
  getMaps: () => window.naver?.maps,
  queryScript: () =>
    document.querySelector<HTMLScriptElement>('script[data-health-map-sdk="naver"]') ?? undefined,
})
export const loadNaverMaps = (clientId: string): Promise<void> => browserSdkLoader.load(clientId)
export const cancelNaverMapsLoad = (): void => browserSdkLoader.cancel()

export class MapSdkLoadError extends Error {
  readonly name = "MapSdkLoadError"
}

export const viewLabel = (view: MapView): string =>
  `${view.latitude.toFixed(4)}, ${view.longitude.toFixed(4)} · 확대 ${view.zoom}`
