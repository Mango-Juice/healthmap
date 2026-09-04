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
            ...(spec.iconUrl ? { icon: spec.iconUrl } : {}),
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
          ...(previous.iconUrl !== spec.iconUrl && spec.iconUrl !== undefined
            ? { icon: spec.iconUrl }
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
