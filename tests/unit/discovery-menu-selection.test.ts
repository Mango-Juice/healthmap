import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { DiscoveryMenuSchema } from "../../lib/discovery/catalog"
import {
  discoveryCategoryIcon,
  discoveryMenuDietaryNote,
  discoveryMenuFactLabel,
  discoveryTagsForMenu,
  filterDiscoveryPlaces,
  hasDiscoveryMealSelectionBasis,
  markerCategoryForMenus,
  markerIconForMenus,
  markerZIndex,
  orderedResultMenus,
  presentDiscoveryMenuName,
} from "../../lib/discovery/menu-selection"
import { queryDiscoveryCatalog } from "../../lib/discovery/query"
import { DiscoveryQuerySchema } from "../../lib/discovery/query-contract"
import { syntheticDiscoveryCatalog } from "../fixtures/discovery-catalog"

const catalog = syntheticDiscoveryCatalog

describe("menu-first Discovery discovery", () => {
  it("Given ordinary meal candidates, When browsing or searching, Then unsupported choices stay out", () => {
    for (const query of ["일반", "합성", "국수", "한상"]) {
      const results = filterDiscoveryPlaces({ catalog, filter: "all", query })
      expect(
        results.every((result) =>
          orderedResultMenus(catalog, result).every(hasDiscoveryMealSelectionBasis),
        ),
      ).toBe(true)
    }
    const raw = catalog.menus.filter((menu) => menu.name.includes("일반"))
    expect(raw.length).toBeGreaterThan(0)
    expect(filterDiscoveryPlaces({ catalog, filter: "rice", query: "일반" })).toEqual([])
    expect(
      filterDiscoveryPlaces({ catalog, filter: "all", ingredient: "chicken", query: "" }).every(
        (result) => orderedResultMenus(catalog, result).every(hasDiscoveryMealSelectionBasis),
      ),
    ).toBe(true)
  })
  it("Given a selected eligible meal, When detail lists other menus, Then it does not recommend unsupported dishes", () => {
    const [result] = filterDiscoveryPlaces({ catalog, filter: "all", query: "합성 곡물" })
    if (!result) throw new Error("expected a grain meal")
    expect(orderedResultMenus(catalog, result).some((menu) => menu.name === "합성 일반 국수")).toBe(
      false,
    )
  })
  it("keeps only meal choices with an explicit selection basis, independently of source", () => {
    const results = filterDiscoveryPlaces({ catalog, filter: "all", query: "" })
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(({ place }) => place.name === "합성 샐러드 식당")).toBe(true)
    expect(results.some(({ place }) => place.name === "합성 곡물 식당")).toBe(true)
    for (const result of results) {
      const matching = catalog.menus.filter((menu) => result.matchingMenuIds.includes(menu.id))
      expect(matching.every(hasDiscoveryMealSelectionBasis)).toBe(true)
    }
  })
  it("shows the queried poke first even when the same place also has salad", () => {
    const results = filterDiscoveryPlaces({ catalog, filter: "all", query: "합성 생선 포케" })
    expect(results.length).toBeGreaterThan(0)
    expect(
      results.every((result) => orderedResultMenus(catalog, result)[0]?.name.includes("포케")),
    ).toBe(true)
  })
  it("matches form and ingredient on the same menu", () => {
    const results = filterDiscoveryPlaces({
      catalog,
      filter: "salad_poke",
      ingredient: "fish",
      query: "",
    })
    expect(results.length).toBeGreaterThan(0)
    expect(
      results.every((result) => {
        const first = orderedResultMenus(catalog, result)[0]
        return first?.facts.form === "salad_poke" && first.facts.ingredients.includes("fish")
      }),
    ).toBe(true)
  })
  it("never combines unrelated menus to satisfy a compound query", () => {
    const base = catalog.menus[0]
    const other = catalog.menus[1]
    const place = catalog.places.find((place) => place.id === base?.placeId)
    if (!base || !other || !place) throw new Error("expected synthetic menu fixture")
    const dish = DiscoveryMenuSchema.parse({
      ...base,
      name: "닭국수",
      facts: {
        ...base.facts,
        scope: "meal",
        form: "noodles",
        ingredients: ["chicken"],
        rice_base: "unknown",
        dietary: "unknown",
      },
    })
    const salad = DiscoveryMenuSchema.parse({
      ...other,
      placeId: place.id,
      name: "두부샐러드",
      facts: {
        ...base.facts,
        scope: "meal",
        form: "salad_poke",
        ingredients: ["tofu_soy"],
        selection_reasons: [{ kind: "salad_poke", basis: "menu_name", text: "두부샐러드" }],
        rice_base: "unknown",
        dietary: "unknown",
      },
    })
    const fixture = { ...catalog, places: [place], menus: [dish, salad] }
    expect(
      filterDiscoveryPlaces({
        catalog: fixture,
        filter: "salad_poke",
        ingredient: "chicken",
        query: "",
      }),
    ).toEqual([])
    expect(filterDiscoveryPlaces({ catalog: fixture, filter: "all", query: "닭 두부" })).toEqual([])
  })
  it("derives rice options only from menu evidence", () => {
    const plain = catalog.menus.find((menu) => menu.name === "합성 일반 국수")
    expect(plain && discoveryTagsForMenu(plain)).not.toContain("whole_grain")
    const results = filterDiscoveryPlaces({ catalog, filter: "whole_grain", query: "" })
    expect(results.length).toBeGreaterThan(0)
    expect(
      results.every(
        (result) => orderedResultMenus(catalog, result)[0]?.facts.rice_base !== "unknown",
      ),
    ).toBe(true)
    expect(
      results.some(
        (result) =>
          orderedResultMenus(catalog, result)[0]?.facts.ordering_note === "곡물밥 선택 가능",
      ),
    ).toBe(true)
  })
  it("uses current area for the same list and marker result", () => {
    const target = filterDiscoveryPlaces({ catalog, filter: "all", query: "" })[0]?.place
    if (!target) throw new Error("expected a synthetic place")
    const results = filterDiscoveryPlaces({
      catalog,
      filter: "all",
      query: "",
      appliedBounds: {
        northEast: { latitude: target.latitude + 0.000001, longitude: target.longitude + 0.000001 },
        southWest: { latitude: target.latitude - 0.000001, longitude: target.longitude - 0.000001 },
      },
    })
    expect(results.map(({ place }) => place.id)).toEqual([target.id])
  })
  it("keeps SDK marker assets and selection emphasis", () => {
    expect(markerIconForMenus([], true)).toBe("/markers/food-map-neutral-selected.svg")
    expect(markerZIndex(true)).toBe(1000)
    expect(markerZIndex(false)).toBeUndefined()
    for (const [filename, color] of [
      ["marker-grain-selected.svg", "#c66a3a"],
      ["marker-plant-selected.svg", "#2f7651"],
      ["marker-mixed-selected.svg", "#2b6048"],
    ]) {
      const svg = readFileSync(resolve("public/markers", filename ?? ""), "utf8")
      expect(svg).toContain(`fill="${color}"`)
      expect(svg).toContain('stroke-width="3"')
      expect(svg).not.toContain('stroke-width="5"')
    }
  })
  it("chooses the strongest discovery tag regardless of menu order", () => {
    const salad = catalog.menus.find((menu) => menu.facts.form === "salad_poke")
    const plantBased = catalog.menus.find((menu) =>
      discoveryTagsForMenu(menu).includes("plant_based"),
    )
    if (!salad || !plantBased) throw new Error("expected synthetic menu fixtures")
    expect(markerCategoryForMenus([plantBased, plantBased, salad])).toBe("plant_based")
    expect(markerCategoryForMenus([salad, plantBased, plantBased])).toBe("plant_based")
  })
  it("uses source-backed dietary and whole-grain evidence for actual unfiltered places", () => {
    const plantPlace = catalog.places.find((place) => place.name === "합성 식물 식당")
    const grainPlace = catalog.places.find((place) => place.name === "합성 곡물 식당")
    if (!plantPlace || !grainPlace) throw new Error("expected synthetic fixture places")
    const eligibleMenus = (placeId: typeof plantPlace.id) =>
      catalog.menus.filter(
        (menu) => menu.placeId === placeId && hasDiscoveryMealSelectionBasis(menu),
      )

    expect(markerCategoryForMenus(eligibleMenus(plantPlace.id), "all", plantPlace.brandId)).toBe(
      "plant_based",
    )
    expect(markerCategoryForMenus(eligibleMenus(grainPlace.id), "all", grainPlace.brandId)).toBe(
      "whole_grain",
    )
  })
  it("uses stable known-brand categories for unfiltered markers", () => {
    const salad = catalog.menus.find((menu) => menu.facts.form === "salad_poke")
    const grilled = catalog.menus.find((menu) =>
      discoveryTagsForMenu(menu).includes("grilled_steamed"),
    )
    if (!salad || !grilled) throw new Error("expected synthetic brand marker fixtures")
    expect(markerCategoryForMenus([salad, grilled], "all", "bon_dosirak")).toBe("rice")
    expect(markerCategoryForMenus([grilled], "all", "salady")).toBe("salad_poke")
  })
  it("lets an explicit matching filter override the known-brand default", () => {
    const grilled = catalog.menus.find((menu) =>
      discoveryTagsForMenu(menu).includes("grilled_steamed"),
    )
    if (!grilled) throw new Error("expected a synthetic grilled menu fixture")
    expect(markerCategoryForMenus([grilled], "grilled_steamed", "bon_dosirak")).toBe(
      "grilled_steamed",
    )
  })
  it("uses semantic evidence for ties and keeps only empty evidence neutral", () => {
    const salad = catalog.menus.find((menu) => menu.facts.form === "salad_poke")
    const rice = catalog.menus.find((menu) => menu.facts.form === "rice")
    if (!salad || !rice) throw new Error("expected synthetic mixed form fixtures")
    const unsupported = { facts: { ...salad.facts, form: "noodles" as const } }
    expect(markerCategoryForMenus([salad, rice])).toBe("salad_poke")
    expect(markerCategoryForMenus([salad, unsupported, unsupported])).toBe("salad_poke")
    expect(markerCategoryForMenus([unsupported])).toBe("neutral")
    expect(markerCategoryForMenus([])).toBe("neutral")
    expect(markerCategoryForMenus([], "all", "bon_dosirak")).toBe("neutral")
  })
  it("uses the salad marker presentation for empty-menu Subway stores", () => {
    expect(markerCategoryForMenus([], "all", "subway")).toBe("salad_poke")
    expect(markerIconForMenus([], false, "all", "subway")).toBe("/markers/food-map-salad_poke.svg")
    expect(markerIconForMenus([], true, "all", "subway")).toBe(
      "/markers/food-map-salad_poke-selected.svg",
    )
  })
  it("keeps the selected marker asset for a stable known-brand category", () => {
    const salad = catalog.menus.find((menu) => menu.facts.form === "salad_poke")
    if (!salad) throw new Error("expected a synthetic salad fixture")
    expect(markerIconForMenus([salad], true, "all", "bon_dosirak")).toBe(
      "/markers/food-map-rice-selected.svg",
    )
  })
  it("labels every eligible cooking meal and keeps fish away from dietary pin symbols", () => {
    const eligible = catalog.menus.filter(hasDiscoveryMealSelectionBasis)
    expect(eligible.every((menu) => discoveryTagsForMenu(menu).length > 0)).toBe(true)
    const fish = eligible.find((menu) => {
      const tags = discoveryTagsForMenu(menu)
      return (
        menu.facts.ingredients.includes("fish") &&
        menu.facts.cooking.includes("grilled") &&
        tags.length === 1 &&
        tags[0] === "grilled_steamed"
      )
    })
    if (!fish) throw new Error("expected a synthetic fish grill")
    expect(discoveryTagsForMenu(fish)).toContain("grilled_steamed")
    expect(discoveryMenuFactLabel(fish)).toContain("생선 · 구이")
    expect(markerCategoryForMenus([fish])).toBe("grilled_steamed")
    expect(markerCategoryForMenus([fish], "grilled_steamed")).toBe("grilled_steamed")
    const fishSalad = eligible.find(
      (menu) => menu.facts.ingredients.includes("fish") && menu.facts.form === "salad_poke",
    )
    if (!fishSalad) throw new Error("expected a synthetic fish salad")
    expect(markerIconForMenus([fishSalad], false)).toBe("/markers/food-map-salad_poke.svg")
    for (const category of [
      "salad_poke",
      "grilled_steamed",
      "whole_grain",
      "plant_based",
      "rice",
      "neutral",
    ] as const) {
      const svg = readFileSync(resolve("public", discoveryCategoryIcon(category).slice(1)), "utf8")
      expect(svg).toContain("<title>")
      expect(svg).not.toContain("비건")
    }
  })
  it("applies cooking category and ingredient to the same menu in API counts", () => {
    const query = DiscoveryQuerySchema.parse({ filter: "grilled_steamed", ingredient: "fish" })
    const response = queryDiscoveryCatalog(catalog, query)
    if (!("results" in response)) throw new Error("expected places")
    const results = filterDiscoveryPlaces({
      catalog,
      filter: "grilled_steamed",
      ingredient: "fish",
      query: "",
    })
    expect(response.total).toBe(results.length)
    expect(response.total).toBeGreaterThan(0)
    for (const result of response.results) {
      for (const menu of result.menus) {
        expect(menu.facts.ingredients).toContain("fish")
        expect(discoveryTagsForMenu(menu)).toContain("grilled_steamed")
        expect(result.matchingMenuIds).toContain(menu.id)
      }
    }
  })
  it("removes the redundant source prefix from menu display", () => {
    expect(presentDiscoveryMenuName("[비건]포케")).toBe("포케")
  })
  it("distinguishes a source vegan label from an option that requires a change", () => {
    expect(discoveryMenuDietaryNote("source_vegan_label")).toBe(
      "출처에서 비건 메뉴로 소개하고 있어요. 재료와 조리 방식은 주문할 때 확인해 주세요.",
    )
    expect(discoveryMenuDietaryNote("vegan_option")).toContain("옵션 선택이나 변경이 필요")
  })
})
