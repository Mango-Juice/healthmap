import type { Menu, Place } from "./catalog.ts"
import type { CookingFilter, IngredientFilter, PlaceFilter } from "./filter.ts"
import { isInsideViewportBounds, type ViewportBounds } from "./viewport.ts"

export type MenuConditions = {
  readonly query: string
  readonly tag: PlaceFilter
  readonly ingredient?: IngredientFilter | undefined
  readonly cooking?: CookingFilter | undefined
}
export type DiscoveryFilterInput = MenuConditions & {
  readonly places: readonly Place[]
  readonly menus: readonly Menu[]
  readonly appliedBounds?: ViewportBounds | undefined
}
export const normalizeDiscoveryQuery = (query: string): string =>
  query.normalize("NFKC").toLocaleLowerCase("en-US").trim().replaceAll(/\s+/gu, " ")

export const menuMatchesCategory = (menu: Menu, tag: PlaceFilter): boolean => {
  if (tag === "all") return true
  if (menu.schemaVersion !== "2.0.0") return menu.healthTags.some((value) => value === tag)
  switch (tag) {
    case "whole_grain":
      return menu.facts.rice_base !== "unknown"
    case "plant_based":
      return menu.facts.dietary !== "unknown"
    case "vegetables":
    case "protein":
    case "balanced":
      return false
    case "salad_poke":
    case "rice":
    case "noodles":
    case "soup":
    case "sandwich":
    case "main_dish":
      return menu.facts.form === tag
    default:
      return assertNever(tag)
  }
}
const INGREDIENT_LABELS = { chicken: "닭", fish: "생선", tofu_soy: "두부 콩" } as const

export const matchingDiscoveryMenus = ({
  place,
  menus,
  query,
  tag,
  ingredient = "all",
  cooking = "all",
}: MenuConditions & {
  readonly place: Place
  readonly menus: readonly Menu[]
}): readonly Menu[] => {
  const tokens = normalizeDiscoveryQuery(query).split(" ").filter(Boolean)
  return menus
    .filter((menu) => {
      if (!menu.published || menu.placeId !== place.id) return false
      if (menu.schemaVersion === "2.0.0") {
        if (!menuMatchesCategory(menu, tag)) return false
        if (ingredient !== "all" && !menu.facts.ingredients.includes(ingredient)) return false
        if (cooking !== "all" && !menu.facts.cooking.includes(cooking)) return false
      } else {
        if (ingredient !== "all" || cooking !== "all") return false
        if (
          tag !== "all" &&
          !(place.schemaVersion !== "2.0.0" && place.healthTags.some((value) => value === tag))
        )
          return false
      }
      const facts =
        menu.schemaVersion === "2.0.0"
          ? [
              menu.facts.ordering_note ?? "",
              ...menu.facts.ingredients.map((value) => INGREDIENT_LABELS[value]),
            ]
          : []
      const searchable = normalizeDiscoveryQuery(
        [place.name, place.address, menu.name, ...facts].join(" "),
      )
      return tokens.every((token) => searchable.includes(token))
    })
    .sort((a, b) => a.displayOrder - b.displayOrder)
}

export const filterDiscoveryPlaces = ({
  places,
  menus,
  appliedBounds,
  ...conditions
}: DiscoveryFilterInput): readonly Place[] =>
  places.filter((place) => {
    if (
      !place.published ||
      (appliedBounds !== undefined && !isInsideViewportBounds(place, appliedBounds))
    )
      return false
    if (matchingDiscoveryMenus({ place, menus, ...conditions }).length > 0) return true
    if (place.schemaVersion === "2.0.0") return false
    if ((conditions.ingredient ?? "all") !== "all" || (conditions.cooking ?? "all") !== "all")
      return false
    if (conditions.tag !== "all" && !place.healthTags.some((value) => value === conditions.tag))
      return false
    const searchable = normalizeDiscoveryQuery(`${place.name} ${place.address}`)
    return normalizeDiscoveryQuery(conditions.query)
      .split(" ")
      .filter(Boolean)
      .every((token) => searchable.includes(token))
  })

const assertNever = (value: never): never => value
