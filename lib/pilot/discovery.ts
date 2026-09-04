import { normalizeDiscoveryQuery } from "../domain/discovery"
import { isInsideViewportBounds, type ViewportBounds } from "../domain/viewport"
import type { PilotCatalog, PilotMenu, PilotPlace } from "./catalog"

export const PILOT_DISCOVERY_FILTERS = [
  { label: "전체", value: "all" },
  { label: "샐러드·포케", value: "salad_poke" },
  { label: "구이·찜", value: "grilled_steamed" },
  { label: "잡곡·현미", value: "whole_grain" },
  { label: "채식 표기", value: "plant_based" },
  { label: "밥·정식", value: "rice" },
] as const
export const PILOT_INGREDIENT_FILTERS = [
  { label: "재료 전체", value: "all" },
  { label: "닭", value: "chicken" },
  { label: "생선", value: "fish" },
  { label: "두부·콩", value: "tofu_soy" },
] as const
export type PilotDiscoveryFilter = (typeof PILOT_DISCOVERY_FILTERS)[number]["value"]
export type PilotIngredientFilter = (typeof PILOT_INGREDIENT_FILTERS)[number]["value"]
export type PilotDiscoveryTag = Exclude<PilotDiscoveryFilter, "all">
export const PILOT_DISCOVERY_LABELS = {
  salad_poke: "샐러드·포케",
  rice: "밥·정식",
  plant_based: "채식 표기",
  whole_grain: "잡곡·현미",
  grilled_steamed: "구이·찜",
} as const

export const discoveryTagsForMenu = (menu: {
  readonly facts: Omit<PilotMenu["facts"], "status">
}): readonly PilotDiscoveryTag[] => {
  const tags: PilotDiscoveryTag[] = []
  if (menu.facts.form === "salad_poke") tags.push("salad_poke")
  if (menu.facts.form === "rice") tags.push("rice")
  if (menu.facts.rice_base !== "unknown") tags.push("whole_grain")
  if (menu.facts.dietary !== "unknown") tags.push("plant_based")
  if (
    menu.facts.ingredients.length > 0 &&
    menu.facts.cooking.length > 0 &&
    menu.facts.selection_reasons.some((reason) => reason.kind === "ingredient_cooking")
  )
    tags.push("grilled_steamed")
  return tags
}
const INGREDIENT_LABELS = { chicken: "닭", fish: "생선", tofu_soy: "두부·콩" } as const
const COOKING_LABELS = { grilled: "구이", steamed: "찜", roasted: "로스트" } as const
export const pilotMenuFactLabel = (menu: {
  readonly facts: Omit<PilotMenu["facts"], "status">
}): string =>
  [
    menu.facts.ingredients.map((ingredient) => INGREDIENT_LABELS[ingredient]).join("·"),
    menu.facts.cooking.map((cooking) => COOKING_LABELS[cooking]).join("·"),
  ]
    .filter(Boolean)
    .join(" · ")
export const hasPilotMealSelectionBasis = (menu: {
  readonly facts: Omit<PilotMenu["facts"], "status">
}): boolean =>
  menu.facts.scope === "meal" &&
  menu.facts.selection_reasons.length > 0 &&
  ((menu.facts.form === "salad_poke" &&
    menu.facts.selection_reasons.some((reason) => reason.kind === "salad_poke")) ||
    (menu.facts.rice_base !== "unknown" &&
      menu.facts.selection_reasons.some((reason) => reason.kind === "whole_grain")) ||
    (menu.facts.dietary !== "unknown" &&
      menu.facts.selection_reasons.some((reason) => reason.kind === "dietary_meal")) ||
    (menu.facts.ingredients.length > 0 &&
      menu.facts.cooking.length > 0 &&
      menu.facts.selection_reasons.some((reason) => reason.kind === "ingredient_cooking")))

export const menusForPilotPlace = (catalog: PilotCatalog, placeId: PilotPlace["id"]) =>
  catalog.menus.filter((menu) => menu.placeId === placeId && hasPilotMealSelectionBasis(menu))
export const presentPilotMenuName = (name: string): string => {
  const label = name.replace(/^\[비건\]/u, "")
  return /옵[션셥]/u.test(label) ? (label.split(/\s+\/\s+/u)[0] ?? label) : label
}
export type PilotResult = {
  readonly place: PilotPlace
  readonly matchingMenuIds: readonly PilotMenu["id"][]
}
type FilterPilotPlacesInput = {
  readonly appliedBounds?: ViewportBounds | undefined
  readonly catalog: PilotCatalog
  readonly filter: PilotDiscoveryFilter
  readonly ingredient?: PilotIngredientFilter
  readonly query: string
}
export const filterPilotPlaces = ({
  appliedBounds,
  catalog,
  filter,
  ingredient = "all",
  query,
}: FilterPilotPlacesInput): readonly PilotResult[] => {
  const tokens = normalizeDiscoveryQuery(query).split(" ").filter(Boolean)
  return catalog.places.flatMap((place) => {
    if (appliedBounds !== undefined && !isInsideViewportBounds(place, appliedBounds)) return []
    const matchingMenuIds = menusForPilotPlace(catalog, place.id)
      .filter((menu) => {
        if (filter !== "all" && !discoveryTagsForMenu(menu).includes(filter)) return false
        if (ingredient !== "all" && !menu.facts.ingredients.includes(ingredient)) return false
        const ingredientNames = PILOT_INGREDIENT_FILTERS.filter(
          (option) => option.value !== "all" && menu.facts.ingredients.includes(option.value),
        ).map((option) => option.label)
        const searchable = normalizeDiscoveryQuery(
          [
            place.name,
            place.address,
            menu.name,
            menu.facts.ordering_note ?? "",
            ...ingredientNames,
          ].join(" "),
        )
        return tokens.every((token) => searchable.includes(token))
      })
      .map((menu) => menu.id)
    return matchingMenuIds.length > 0 ? [{ place, matchingMenuIds }] : []
  })
}
export const orderedResultMenus = (catalog: PilotCatalog, result: PilotResult) => {
  const matching = new Set(result.matchingMenuIds)
  return menusForPilotPlace(catalog, result.place.id).sort(
    (a, b) => Number(matching.has(b.id)) - Number(matching.has(a.id)),
  )
}
export const markerCategoryForMenus = (
  menus: readonly { readonly facts: Omit<PilotMenu["facts"], "status"> }[],
  filter: PilotDiscoveryFilter = "all",
): PilotDiscoveryTag | "neutral" => {
  const first = menus[0]
  if (first === undefined) return "neutral"
  const tags = discoveryTagsForMenu(first)
  if (filter !== "all" && tags.includes(filter)) return filter
  return (
    (["salad_poke", "whole_grain", "plant_based", "grilled_steamed", "rice"] as const).find((tag) =>
      tags.includes(tag),
    ) ?? "neutral"
  )
}
export const pilotCategoryIcon = (category: PilotDiscoveryTag | "neutral", selected = false) =>
  `/markers/pilot-${category}${selected ? "-selected" : ""}.svg`
export const markerIconForMenus = (
  menus: readonly { readonly facts: Omit<PilotMenu["facts"], "status"> }[],
  selected: boolean,
  filter: PilotDiscoveryFilter = "all",
): string => pilotCategoryIcon(markerCategoryForMenus(menus, filter), selected)
export const markerZIndex = (selected: boolean): number | undefined => (selected ? 1000 : undefined)
