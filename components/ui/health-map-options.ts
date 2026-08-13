export const FILTER_OPTIONS = [
  { label: "전체", value: "all" },
  { label: "채소", value: "vegetables" },
  { label: "단백질", value: "protein" },
  { label: "균형식", value: "balanced" },
  { label: "식물성", value: "plant_based" },
] as const

export type FilterValue = (typeof FILTER_OPTIONS)[number]["value"]

export const CATEGORY_LABELS = {
  balanced: "균형식",
  plant_based: "식물성",
  protein: "단백질",
  vegetables: "채소",
} as const satisfies Record<Exclude<FilterValue, "all">, string>
