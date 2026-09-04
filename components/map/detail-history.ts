import {
  type CookingFilter,
  CookingFilterSchema,
  type IngredientFilter,
  IngredientFilterSchema,
  type PlaceFilter,
  PlaceFilterSchema,
} from "../../lib/domain/filter"
import type { GeoPoint, MapView } from "../../lib/domain/geo"
import type { ViewportBounds } from "../../lib/domain/viewport"

export type HistorySnapshot = {
  readonly filter: PlaceFilter
  readonly ingredient?: IngredientFilter | undefined
  readonly cooking?: CookingFilter | undefined
  readonly appliedBounds: ViewportBounds
  readonly query: string
  readonly trayExpanded: boolean
  readonly url: string
  readonly view: MapView
}

export type DetailPhase = "closed" | "opening" | "open" | "closing"
export type DetailMotion = "start" | "settled"

const MAP_SNAPSHOT_KEY = "healthmap.selection-map.v1"

const isPoint = (value: unknown): value is GeoPoint =>
  typeof value === "object" &&
  value !== null &&
  "latitude" in value &&
  typeof value.latitude === "number" &&
  Number.isFinite(value.latitude) &&
  "longitude" in value &&
  typeof value.longitude === "number" &&
  Number.isFinite(value.longitude)

const isBounds = (value: unknown): value is ViewportBounds =>
  typeof value === "object" &&
  value !== null &&
  "southWest" in value &&
  isPoint(value.southWest) &&
  "northEast" in value &&
  isPoint(value.northEast)

export const isHistorySnapshot = (value: unknown): value is HistorySnapshot =>
  typeof value === "object" &&
  value !== null &&
  "filter" in value &&
  PlaceFilterSchema.safeParse(value.filter).success &&
  (!("ingredient" in value) || IngredientFilterSchema.safeParse(value.ingredient).success) &&
  (!("cooking" in value) || CookingFilterSchema.safeParse(value.cooking).success) &&
  "view" in value &&
  isPoint(value.view) &&
  "zoom" in value.view &&
  typeof value.view.zoom === "number" &&
  Number.isFinite(value.view.zoom) &&
  "appliedBounds" in value &&
  isBounds(value.appliedBounds) &&
  "query" in value &&
  typeof value.query === "string" &&
  "trayExpanded" in value &&
  typeof value.trayExpanded === "boolean" &&
  "url" in value &&
  typeof value.url === "string"

export const readMapSnapshot = (): HistorySnapshot | undefined => {
  let raw: string | null
  try {
    raw = window.sessionStorage.getItem(MAP_SNAPSHOT_KEY)
    window.sessionStorage.removeItem(MAP_SNAPSHOT_KEY)
  } catch (error) {
    if (error instanceof DOMException) return undefined
    throw error
  }
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
  const serialized = JSON.stringify(snapshot)
  try {
    window.sessionStorage.setItem(MAP_SNAPSHOT_KEY, serialized)
  } catch (error) {
    if (error instanceof DOMException) return
    throw error
  }
}
