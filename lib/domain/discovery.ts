import type { Menu, Place } from "./catalog.ts"
import type { PlaceFilter } from "./filter.ts"
import { isInsideViewportBounds, type ViewportBounds } from "./viewport.ts"

export type DiscoveryFilterInput = {
  readonly places: readonly Place[]
  readonly menus: readonly Menu[]
  readonly query: string
  readonly tag: PlaceFilter
  readonly appliedBounds: ViewportBounds
}

export const normalizeDiscoveryQuery = (query: string): string =>
  query.normalize("NFKC").toLocaleLowerCase("en-US").trim().replaceAll(/\s+/gu, " ")

const isTagMatch = (place: Place, tag: PlaceFilter): boolean =>
  tag === "all" || place.healthTags.includes(tag)

const menusByPlaceId = (menus: readonly Menu[]): ReadonlyMap<Place["id"], readonly string[]> => {
  const result = new Map<Place["id"], readonly string[]>()
  for (const menu of menus) {
    const names = result.get(menu.placeId) ?? []
    result.set(menu.placeId, [...names, normalizeDiscoveryQuery(menu.name)])
  }
  return result
}

const isQueryMatch = (
  place: Place,
  menuNames: readonly string[],
  tokens: readonly string[],
): boolean => {
  if (tokens.length === 0) return true
  const searchable = normalizeDiscoveryQuery([place.name, place.address, ...menuNames].join(" "))
  return tokens.every((token) => searchable.includes(token))
}

export const filterDiscoveryPlaces = ({
  places,
  menus,
  query,
  tag,
  appliedBounds,
}: DiscoveryFilterInput): readonly Place[] => {
  const tokens = normalizeDiscoveryQuery(query).split(" ").filter(Boolean)
  const normalizedMenus = menusByPlaceId(menus)
  return places.filter(
    (place) =>
      isTagMatch(place, tag) &&
      isInsideViewportBounds(place, appliedBounds) &&
      isQueryMatch(place, normalizedMenus.get(place.id) ?? [], tokens),
  )
}
