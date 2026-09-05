import type {
  MapMarkerSpec,
  NaverMap,
  NaverMapListener,
  NaverMapsApi,
  NaverMarker,
} from "./adapter"

type MarkerEntry = {
  readonly marker: NaverMarker
  readonly listener: NaverMapListener
  spec: MapMarkerSpec
}

const markerIcon = (iconUrl: string, compact: boolean | undefined) => {
  if (!compact) return iconUrl
  const image = document.createElement("img")
  image.alt = ""
  image.ariaHidden = "true"
  image.src = iconUrl
  image.style.cssText = "display:block;height:43px;width:36px"
  const content = document.createElement("span")
  content.style.cssText =
    "align-items:flex-end;display:flex;height:48px;justify-content:center;width:44px"
  content.append(image)
  return { anchor: { x: 22, y: 48 }, content, size: { height: 48, width: 44 } }
}

export function createMarkerRegistry(maps: NaverMapsApi, map: NaverMap) {
  const entries = new Map<string, MarkerEntry>()
  const remove = (id: string, entry: MarkerEntry, nativeListenersAreValid: boolean): void => {
    if (nativeListenersAreValid) maps.Event.removeListener(entry.listener)
    entry.marker.setMap(null)
    entries.delete(id)
  }
  return {
    clear: (nativeListenersAreValid: boolean): void => {
      for (const [id, entry] of entries) remove(id, entry, nativeListenersAreValid)
    },
    sync: (specs: readonly MapMarkerSpec[]): void => {
      const retained = new Set(specs.map((spec) => spec.id))
      for (const [id, entry] of entries) {
        if (!retained.has(id)) remove(id, entry, true)
      }
      for (const spec of specs) {
        let entry = entries.get(spec.id)
        if (entry && entry.spec.iconUrl !== undefined && spec.iconUrl === undefined) {
          remove(spec.id, entry, true)
          entry = undefined
        }
        if (!entry) {
          const marker = new maps.Marker({
            clickable: true,
            ...(spec.iconUrl ? { icon: markerIcon(spec.iconUrl, spec.compactIcon) } : {}),
            map,
            position: new maps.LatLng(spec.latitude, spec.longitude),
            title: spec.label,
            ...(spec.zIndex === undefined ? {} : { zIndex: spec.zIndex }),
          })
          entries.set(spec.id, {
            marker,
            spec,
            listener: maps.Event.addListener(marker, "click", () =>
              entries.get(spec.id)?.spec.onSelect(),
            ),
          })
          continue
        }
        const previous = entry.spec
        const options = {
          ...((previous.iconUrl !== spec.iconUrl || previous.compactIcon !== spec.compactIcon) &&
          spec.iconUrl !== undefined
            ? { icon: markerIcon(spec.iconUrl, spec.compactIcon) }
            : {}),
          ...(previous.zIndex !== spec.zIndex ? { zIndex: spec.zIndex ?? 0 } : {}),
          ...(previous.label !== spec.label ? { title: spec.label } : {}),
          ...(previous.latitude !== spec.latitude || previous.longitude !== spec.longitude
            ? { position: new maps.LatLng(spec.latitude, spec.longitude) }
            : {}),
        }
        if (Object.keys(options).length > 0) entry.marker.setOptions(options)
        entry.spec = spec
      }
    },
  }
}
