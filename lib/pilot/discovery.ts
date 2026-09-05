import { normalizeDiscoveryQuery } from "../domain/discovery"
import { isInsideViewportBounds, type ViewportBounds } from "../domain/viewport"
import type { PilotCatalog, PilotMenu, PilotPlace } from "./catalog"

export const PILOT_DISCOVERY_FILTERS = [
  { label: "전체", value: "all" },
  { label: "샐러드·포케", value: "salad_poke" },
  { label: "구이·찜", value: "grilled_steamed" },
  { label: "잡곡·현미", value: "whole_grain" },
  { label: "채식 메뉴", value: "plant_based" },
  { label: "밥·도시락", value: "rice" },
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
  rice: "밥·도시락",
  plant_based: "채식 메뉴",
  whole_grain: "잡곡·현미",
  grilled_steamed: "구이·찜",
} as const
const PILOT_MARKER_CATEGORY_PRIORITY: readonly PilotDiscoveryTag[] = [
  "plant_based",
  "whole_grain",
  "grilled_steamed",
  "salad_poke",
  "rice",
]

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
export const pilotMenuDietaryNote = (
  dietary: PilotMenu["facts"]["dietary"],
): string | undefined => {
  if (dietary === "source_vegan_label")
    return "출처에서 비건 메뉴로 소개하고 있어요. 재료와 조리 방식은 주문할 때 확인해 주세요."
  if (dietary === "vegan_option")
    return "비건으로 주문하려면 옵션 선택이나 변경이 필요해요. 재료와 조리 방식은 주문할 때 확인해 주세요."
  return undefined
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
  brandId?: string | null,
): PilotDiscoveryTag | "neutral" => {
  if (menus.length === 0) return "neutral"
  if (filter !== "all" && menus.some((menu) => discoveryTagsForMenu(menu).includes(filter)))
    return filter
  if (brandId === "bon_dosirak") return "rice"
  if (brandId === "salady" || brandId === "slowcali" || brandId === "pokeallday")
    return "salad_poke"
  const counts = new Map<PilotDiscoveryTag, number>()
  for (const menu of menus) {
    for (const tag of discoveryTagsForMenu(menu)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return PILOT_MARKER_CATEGORY_PRIORITY.reduce<PilotDiscoveryTag | "neutral">(
    (leading, category) => {
      const leadingCount = leading === "neutral" ? 0 : (counts.get(leading) ?? 0)
      return (counts.get(category) ?? 0) > leadingCount ? category : leading
    },
    "neutral",
  )
}
export const pilotCategoryIcon = (category: PilotDiscoveryTag | "neutral", selected = false) =>
  `/markers/pilot-${category}${selected ? "-selected" : ""}.svg`
export const markerIconForMenus = (
  menus: readonly { readonly facts: Omit<PilotMenu["facts"], "status"> }[],
  selected: boolean,
  filter: PilotDiscoveryFilter = "all",
  brandId?: string | null,
): string => pilotCategoryIcon(markerCategoryForMenus(menus, filter, brandId), selected)
export const markerZIndex = (selected: boolean): number | undefined => (selected ? 1000 : undefined)
