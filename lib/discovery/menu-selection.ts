import type { DiscoveryMenuDto } from "./dto"

export const DISCOVERY_FILTERS = [
  { label: "전체", value: "all" },
  { label: "샐러드·포케", value: "salad_poke" },
  { label: "구이·찜", value: "grilled_steamed" },
  { label: "잡곡·현미", value: "whole_grain" },
  { label: "채식 메뉴", value: "plant_based" },
  { label: "밥·도시락", value: "rice" },
] as const
export type DiscoveryFilter = (typeof DISCOVERY_FILTERS)[number]["value"]
export type DiscoveryIngredientFilter = "all" | "chicken" | "fish" | "tofu_soy"
export type DiscoveryTag = Exclude<DiscoveryFilter, "all">
export const DISCOVERY_LABELS = {
  salad_poke: "샐러드·포케",
  rice: "밥·도시락",
  plant_based: "채식 메뉴",
  whole_grain: "잡곡·현미",
  grilled_steamed: "구이·찜",
} as const
const DISCOVERY_MARKER_CATEGORY_PRIORITY: readonly DiscoveryTag[] = [
  "plant_based",
  "whole_grain",
  "grilled_steamed",
  "salad_poke",
  "rice",
]

export const discoveryTagsForMenu = (menu: {
  readonly facts: DiscoveryMenuDto["facts"]
}): readonly DiscoveryTag[] => {
  const tags: DiscoveryTag[] = []
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
export const discoveryMenuFactLabel = (menu: {
  readonly facts: DiscoveryMenuDto["facts"]
}): string =>
  [
    menu.facts.ingredients.map((ingredient) => INGREDIENT_LABELS[ingredient]).join("·"),
    menu.facts.cooking.map((cooking) => COOKING_LABELS[cooking]).join("·"),
  ]
    .filter(Boolean)
    .join(" · ")
export const presentDiscoveryMenuName = (name: string): string => {
  const label = name.replace(/^\[비건\]/u, "")
  return /옵[션셥]/u.test(label) ? (label.split(/\s+\/\s+/u)[0] ?? label) : label
}
export const discoveryMenuDietaryNote = (
  dietary: DiscoveryMenuDto["facts"]["dietary"],
): string | undefined => {
  if (dietary === "source_vegan_label")
    return "출처에서 비건 메뉴로 소개하고 있어요. 재료와 조리 방식은 주문할 때 확인해 주세요."
  if (dietary === "vegan_option")
    return "비건으로 주문하려면 옵션 선택이나 변경이 필요해요. 재료와 조리 방식은 주문할 때 확인해 주세요."
  return undefined
}
export const markerCategoryForMenus = (
  menus: readonly { readonly facts: DiscoveryMenuDto["facts"] }[],
  filter: DiscoveryFilter = "all",
  brandId?: string | null,
): DiscoveryTag | "neutral" => {
  if (brandId === "subway") return "salad_poke"
  if (menus.length === 0) return "neutral"
  if (filter !== "all" && menus.some((menu) => discoveryTagsForMenu(menu).includes(filter)))
    return filter
  if (brandId === "bon_dosirak") return "rice"
  if (brandId === "salady" || brandId === "slowcali" || brandId === "pokeallday")
    return "salad_poke"
  const counts = new Map<DiscoveryTag, number>()
  for (const menu of menus) {
    for (const tag of discoveryTagsForMenu(menu)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return DISCOVERY_MARKER_CATEGORY_PRIORITY.reduce<DiscoveryTag | "neutral">(
    (leading, category) => {
      const leadingCount = leading === "neutral" ? 0 : (counts.get(leading) ?? 0)
      return (counts.get(category) ?? 0) > leadingCount ? category : leading
    },
    "neutral",
  )
}
export const discoveryCategoryIcon = (category: DiscoveryTag | "neutral", selected = false) =>
  `/markers/food-map-${category}${selected ? "-selected" : ""}.svg`
export const markerIconForMenus = (
  menus: readonly { readonly facts: DiscoveryMenuDto["facts"] }[],
  selected: boolean,
  filter: DiscoveryFilter = "all",
  brandId?: string | null,
): string => discoveryCategoryIcon(markerCategoryForMenus(menus, filter, brandId), selected)
export const markerZIndex = (selected: boolean): number | undefined => (selected ? 1000 : undefined)
