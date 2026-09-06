import { PilotCatalogSchema } from "../../lib/pilot/catalog"

const evidence = (source: "bon_dosirak" | "salady", suffix: string) => ({
  capturedAt: "2026-09-01T00:00:00.000Z",
  digestKind: "structured_source" as const,
  effectiveAt: null,
  evidenceUrl:
    source === "bon_dosirak"
      ? `https://api.bonif.co.kr/brand/v1/menu?brdCd=${suffix}`
      : `https://www.salady.com/menu/${suffix}`,
  expiresAt: "2026-12-01T00:00:00.000Z",
  publishedAt: null,
  rawText: `SYNTHETIC TEST ONLY ${suffix}`,
  source,
  sourceReviewStatus: "reviewed" as const,
  sourceSha256: "a".repeat(64),
})

const place = (
  id: string,
  slug: string,
  name: string,
  address: string,
  brandId: string | null = null,
) => ({
  address,
  brandId,
  brandVariant: null,
  id,
  latitude: 37 + Number.parseInt(id.slice(-1), 10) / 100,
  longitude: 127 + Number.parseInt(id.slice(-1), 10) / 100,
  media: [],
  name,
  naverPlaceUrl: null,
  phone: null,
  reviewStatus: "candidate" as const,
  slug,
  sources: [brandId === "salady" ? "salady" : "bon_dosirak"],
})

const menu = (
  id: string,
  placeId: string,
  name: string,
  facts: Readonly<{
    readonly cooking: readonly ("grilled" | "steamed" | "roasted")[]
    readonly dietary: "source_vegan_label" | "vegan_option" | "unknown"
    readonly form: "salad_poke" | "rice" | "noodles" | "main_dish"
    readonly ingredients: readonly ("chicken" | "fish" | "tofu_soy")[]
    readonly rice_base: "brown_rice" | "mixed_grain" | "barley" | "unknown"
    readonly selection_reasons: readonly Readonly<{
      readonly basis: "menu_name"
      readonly kind: "salad_poke" | "whole_grain" | "dietary_meal" | "ingredient_cooking"
      readonly text: string
    }>[]
  }>,
) => ({
  brandId: null,
  brandVariant: null,
  branchApplicability: "branch_confirmed" as const,
  evidence: [evidence("bon_dosirak", id)],
  facts: {
    base_is_option: false,
    cooking: facts.cooking,
    dietary: facts.dietary,
    form: facts.form,
    ingredients: facts.ingredients,
    ordering_note: facts.rice_base === "unknown" ? null : "곡물밥 선택 가능",
    rice_base: facts.rice_base,
    scope: "meal" as const,
    selection_reasons: facts.selection_reasons,
    status: "candidate" as const,
  },
  id,
  name,
  placeId,
  placeMatch: "exact_match" as const,
})

const places = [
  place(
    "bc6b1050-539e-4d28-8493-5920eae54248",
    "synthetic-salad-place",
    "합성 샐러드 식당",
    "서울특별시 강남구 테스트로 1",
    "salady",
  ),
  place(
    "bede62e8-6e4d-4d3b-8227-34b73451b3a4",
    "synthetic-grain-place",
    "합성 곡물 식당",
    "서울특별시 강남구 테스트로 2",
  ),
  place(
    "c4e1cffb-2658-4ad4-8e38-c8c12a11c627",
    "synthetic-plant-place",
    "합성 식물 식당",
    "서울특별시 강남구 테스트로 3",
  ),
  place(
    "75708968-2839-4eba-8b44-f613de821d6c",
    "synthetic-grill-place",
    "합성 구이 식당",
    "서울특별시 강남구 테스트로 4",
  ),
  place(
    "4ebaeeac-274e-494f-84ad-6ce34a48b6f5",
    "synthetic-plain-place",
    "합성 일반 식당",
    "서울특별시 강남구 테스트로 5",
  ),
  place(
    "e68ddcb7-30bb-4e00-811c-b47303a73957",
    "synthetic-link-place",
    "테스트 링크 장소",
    "경기 수원시 테스트로 6",
  ),
] as const

const menus = [
  menu("2a8039ba-6862-4bf5-882c-298892e7caf0", places[0].id, "합성 생선 포케", {
    cooking: [],
    dietary: "unknown",
    form: "salad_poke",
    ingredients: ["fish"],
    rice_base: "unknown",
    selection_reasons: [{ basis: "menu_name", kind: "salad_poke", text: "합성 생선 포케" }],
  }),
  menu("f6a43353-4f04-4384-86ea-c145918e95c4", places[0].id, "합성 두부 샐러드", {
    cooking: [],
    dietary: "unknown",
    form: "salad_poke",
    ingredients: ["tofu_soy"],
    rice_base: "unknown",
    selection_reasons: [{ basis: "menu_name", kind: "salad_poke", text: "합성 두부 샐러드" }],
  }),
  menu("52eb446a-a1ec-445a-8769-b361006408b6", places[1].id, "합성 곡물 한상", {
    cooking: [],
    dietary: "unknown",
    form: "main_dish",
    ingredients: [],
    rice_base: "brown_rice",
    selection_reasons: [{ basis: "menu_name", kind: "whole_grain", text: "합성 곡물 한상" }],
  }),
  menu("20000000-0000-4000-8000-000000000004", places[2].id, "합성 식물 한상", {
    cooking: [],
    dietary: "source_vegan_label",
    form: "main_dish",
    ingredients: [],
    rice_base: "unknown",
    selection_reasons: [{ basis: "menu_name", kind: "dietary_meal", text: "합성 식물 한상" }],
  }),
  menu("20000000-0000-4000-8000-000000000005", places[3].id, "합성 생선 구이", {
    cooking: ["grilled"],
    dietary: "unknown",
    form: "main_dish",
    ingredients: ["fish"],
    rice_base: "unknown",
    selection_reasons: [{ basis: "menu_name", kind: "ingredient_cooking", text: "합성 생선 구이" }],
  }),
  menu("20000000-0000-4000-8000-000000000006", places[4].id, "합성 일반 국수", {
    cooking: [],
    dietary: "unknown",
    form: "noodles",
    ingredients: ["chicken"],
    rice_base: "unknown",
    selection_reasons: [],
  }),
  menu("20000000-0000-4000-8000-000000000007", places[4].id, "합성 일반 밥", {
    cooking: [],
    dietary: "unknown",
    form: "rice",
    ingredients: [],
    rice_base: "unknown",
    selection_reasons: [],
  }),
  menu("20000000-0000-4000-8000-000000000008", places[5].id, "합성 링크 한상", {
    cooking: [],
    dietary: "unknown",
    form: "rice",
    ingredients: [],
    rice_base: "mixed_grain",
    selection_reasons: [{ basis: "menu_name", kind: "whole_grain", text: "합성 링크 한상" }],
  }),
] as const

export const syntheticPilotCatalog = PilotCatalogSchema.parse({
  asOf: "2026-09-05T00:00:00.000Z",
  catalogVersion: "pilot-20260905-aaaaaaaaaaaa",
  menus,
  places,
  schemaVersion: "pilot-menu-facts-2",
})
