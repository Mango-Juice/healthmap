import { normalizeDiscoveryQuery } from "../domain/discovery"
import { isInsideViewportBounds, type ViewportBounds } from "../domain/viewport"
import type { PilotCatalog, PilotPlace, PilotSource } from "./catalog"

export const PILOT_DISCOVERY_FILTERS = [
  { label: "전체", value: "all" },
  { label: "잡곡밥", value: "whole_grain" },
  { label: "비건·채식", value: "plant_based" },
] as const

export type PilotDiscoveryFilter = (typeof PILOT_DISCOVERY_FILTERS)[number]["value"]
export type PilotDiscoveryTag = Exclude<PilotDiscoveryFilter, "all">

const SOURCE_BY_TAG = {
  plant_based: "seoul_vegetarian",
  whole_grain: "seoul_wholegrain",
} as const satisfies Record<PilotDiscoveryTag, PilotSource>

const DISCOVERY_TAGS = ["whole_grain", "plant_based"] as const

export const PILOT_DISCOVERY_LABELS = {
  plant_based: "비건·채식",
  whole_grain: "잡곡밥",
} as const satisfies Record<PilotDiscoveryTag, string>

export const discoveryTagsForPlace = (place: PilotPlace): readonly PilotDiscoveryTag[] =>
  DISCOVERY_TAGS.filter((tag) => place.sources.includes(SOURCE_BY_TAG[tag]))

export const consumerPilotPlaces = (places: readonly PilotPlace[]): readonly PilotPlace[] =>
  places.filter((place) => discoveryTagsForPlace(place).length > 0)

export const menusForPilotPlace = (catalog: PilotCatalog, placeId: PilotPlace["id"]) =>
  catalog.menus.filter((menu) => menu.placeId === placeId)

export const presentPilotMenuName = (name: string): string => name.replace(/^\[비건\]/u, "")

type FilterPilotPlacesInput = {
  readonly appliedBounds?: ViewportBounds | undefined
  readonly catalog: PilotCatalog
  readonly filter: PilotDiscoveryFilter
  readonly places: readonly PilotPlace[]
  readonly query: string
}

export const filterPilotPlaces = ({
  appliedBounds,
  catalog,
  filter,
  places,
  query,
}: FilterPilotPlacesInput): readonly PilotPlace[] => {
  const tokens = normalizeDiscoveryQuery(query).split(" ").filter(Boolean)
  const menuNamesByPlaceId = new Map<PilotPlace["id"], readonly string[]>()
  for (const menu of catalog.menus) {
    const names = menuNamesByPlaceId.get(menu.placeId) ?? []
    menuNamesByPlaceId.set(menu.placeId, [...names, menu.name])
  }
  return places.filter((place) => {
    if (appliedBounds !== undefined && !isInsideViewportBounds(place, appliedBounds)) return false
    if (filter !== "all" && !discoveryTagsForPlace(place).includes(filter)) return false
    const searchable = normalizeDiscoveryQuery(
      [place.name, place.address, ...(menuNamesByPlaceId.get(place.id) ?? [])].join(" "),
    )
    return tokens.every((token) => searchable.includes(token))
  })
}

export const markerIconForPlace = (place: PilotPlace, selected: boolean): string => {
  const tags = discoveryTagsForPlace(place)
  const category = tags.length > 1 ? "mixed" : tags.includes("plant_based") ? "plant" : "grain"
  return `/markers/marker-${category}${selected ? "-selected" : ""}.svg`
}

export const markerZIndex = (selected: boolean): number | undefined => (selected ? 1000 : undefined)
