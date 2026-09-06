import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import type { DiscoveryMenuDto } from "../../lib/discovery/dto"
import {
  discoveryCategoryIcon,
  discoveryMenuDietaryNote,
  discoveryMenuFactLabel,
  discoveryTagsForMenu,
  markerCategoryForMenus,
  markerIconForMenus,
  markerZIndex,
  presentDiscoveryMenuName,
} from "../../lib/discovery/menu-selection"

const baseFacts = {
  scope: "meal",
  form: "main_dish",
  ingredients: [],
  rice_base: "unknown",
  base_is_option: false,
  dietary: "unknown",
  ordering_note: null,
  cooking: [],
  selection_reasons: [],
} as const satisfies DiscoveryMenuDto["facts"]

describe("current menu presentation", () => {
  it("derives consumer categories from the same menu facts", () => {
    const salad = {
      facts: {
        ...baseFacts,
        form: "salad_poke",
        selection_reasons: [{ basis: "menu_name", kind: "salad_poke", text: "생선 포케" }],
      },
    } as const
    const grain = {
      facts: {
        ...baseFacts,
        rice_base: "brown_rice",
        selection_reasons: [{ basis: "menu_name", kind: "whole_grain", text: "현미 그릇" }],
      },
    } as const
    const plant = {
      facts: {
        ...baseFacts,
        dietary: "source_vegan_label",
        selection_reasons: [{ basis: "menu_name", kind: "dietary_meal", text: "비건 그릇" }],
      },
    } as const
    const grilled = {
      facts: {
        ...baseFacts,
        ingredients: ["fish"],
        cooking: ["grilled"],
        selection_reasons: [{ basis: "menu_name", kind: "ingredient_cooking", text: "구운 생선" }],
      },
    } as const

    expect(discoveryTagsForMenu(salad)).toEqual(["salad_poke"])
    expect(discoveryTagsForMenu(grain)).toEqual(["whole_grain"])
    expect(discoveryTagsForMenu(plant)).toEqual(["plant_based"])
    expect(discoveryTagsForMenu(grilled)).toEqual(["grilled_steamed"])
    expect(discoveryMenuFactLabel(grilled)).toBe("생선 · 구이")
  })

  it("keeps marker priority stable across result order and known brands", () => {
    const salad = { facts: { ...baseFacts, form: "salad_poke" } } as const
    const plant = { facts: { ...baseFacts, dietary: "source_vegan_label" } } as const
    const grilled = {
      facts: {
        ...baseFacts,
        ingredients: ["fish"],
        cooking: ["grilled"],
        selection_reasons: [{ basis: "menu_name", kind: "ingredient_cooking", text: "구운 생선" }],
      },
    } as const

    expect(markerCategoryForMenus([plant, plant, salad])).toBe("plant_based")
    expect(markerCategoryForMenus([salad, plant, plant])).toBe("plant_based")
    expect(markerCategoryForMenus([grilled], "all", "salady")).toBe("salad_poke")
    expect(markerCategoryForMenus([grilled], "all", "bon_dosirak")).toBe("rice")
    expect(markerCategoryForMenus([grilled], "grilled_steamed", "bon_dosirak")).toBe(
      "grilled_steamed",
    )
    expect(markerCategoryForMenus([], "all", "subway")).toBe("salad_poke")
    expect(markerCategoryForMenus([])).toBe("neutral")
  })

  it("keeps only current SDK marker assets and selected emphasis", () => {
    expect(markerIconForMenus([], true)).toBe("/markers/food-map-neutral-selected.svg")
    expect(markerIconForMenus([], false, "all", "subway")).toBe("/markers/food-map-salad_poke.svg")
    expect(markerZIndex(true)).toBe(1000)
    expect(markerZIndex(false)).toBeUndefined()

    for (const [filename, color] of [
      ["food-map-whole_grain-selected.svg", "#a8542f"],
      ["food-map-plant_based-selected.svg", "#18563b"],
      ["food-map-salad_poke-selected.svg", "#225f86"],
    ]) {
      const svg = readFileSync(resolve("public/markers", filename ?? ""), "utf8")
      expect(svg).toContain(`fill="${color}"`)
      expect(svg).toContain('stroke-width="3"')
    }

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

  it("presents stored menu names and dietary conditions without source prefixes", () => {
    expect(presentDiscoveryMenuName("[비건]포케")).toBe("포케")
    expect(discoveryMenuDietaryNote("source_vegan_label")).toContain("출처에서 비건 메뉴")
    expect(discoveryMenuDietaryNote("vegan_option")).toContain("옵션 선택이나 변경이 필요")
    expect(discoveryMenuDietaryNote("unknown")).toBeUndefined()
  })
})
