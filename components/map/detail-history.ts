import type { PlaceFilter } from "../../lib/domain/filter"
import type { MapView } from "../../lib/domain/geo"

export type HistorySnapshot = {
  readonly filter: PlaceFilter
  readonly url: string
  readonly view: MapView
}

export type DetailPhase = "closed" | "opening" | "open" | "closing"
export type DetailMotion = "start" | "settled"

const MAP_SNAPSHOT_KEY = "healthmap.selection-map.v1"

export const isHistorySnapshot = (value: unknown): value is HistorySnapshot =>
  typeof value === "object" &&
  value !== null &&
  "filter" in value &&
  (value.filter === "all" ||
    value.filter === "vegetables" ||
    value.filter === "protein" ||
    value.filter === "balanced" ||
    value.filter === "plant_based") &&
  "view" in value &&
  typeof value.view === "object" &&
  value.view !== null &&
  "latitude" in value.view &&
  typeof value.view.latitude === "number" &&
  "longitude" in value.view &&
  typeof value.view.longitude === "number" &&
  "zoom" in value.view &&
  typeof value.view.zoom === "number" &&
  "url" in value &&
  typeof value.url === "string"

export const readMapSnapshot = (): HistorySnapshot | undefined => {
  const raw = window.sessionStorage.getItem(MAP_SNAPSHOT_KEY)
  window.sessionStorage.removeItem(MAP_SNAPSHOT_KEY)
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return isHistorySnapshot(parsed) ? parsed : undefined
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

export const storeMapSnapshot = (snapshot: HistorySnapshot): void => {
  window.sessionStorage.setItem(MAP_SNAPSHOT_KEY, JSON.stringify(snapshot))
}
