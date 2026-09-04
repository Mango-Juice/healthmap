import { describe, expect, it } from "vitest"
import { resolveLocationOutcome } from "../../../lib/domain/geo"
import { parseMapShareQuery } from "../../../lib/domain/share-query"

describe("nationwide public discovery", () => {
  it("accepts Jeju location when browser coordinates are valid", () => {
    const point = { latitude: 33.4996, longitude: 126.5312 }
    const outcome = resolveLocationOutcome({ kind: "success", point })
    expect(outcome).toEqual({ kind: "inside", point, recenter: true, marker: true })
  })
  it("restores a Busan map share with explicit menu conditions", () => {
    const query =
      "q=두부&tag=rice&lat=35.1796&lng=129.0756&z=12&ingredient=tofu_soy&cooking=grilled"
    const result = parseMapShareQuery(query)
    expect(result).toEqual({
      q: "두부",
      tag: "rice",
      lat: 35.1796,
      lng: 129.0756,
      z: 12,
      ingredient: "tofu_soy",
      cooking: "grilled",
    })
  })
})

import { MenuSchema, PlaceSchema } from "../../../lib/domain/catalog"
import { matchingDiscoveryMenus } from "../../../lib/domain/discovery"
import { V2_MENU, V2_PLACE } from "./catalog-v2-fixture"

describe("same-menu public conditions", () => {
  const place = PlaceSchema.parse(V2_PLACE)
  const fish = MenuSchema.parse(V2_MENU)
  const tofu = MenuSchema.parse({
    ...V2_MENU,
    id: "f6a43353-4f04-4384-86ea-c145918e95c4",
    name: "두부찜",
    facts: {
      ...V2_MENU.facts,
      ingredients: ["tofu_soy"],
      cooking: ["steamed"],
      selection_reasons: [{ kind: "ingredient_cooking", basis: "menu_name", text: "두부찜" }],
    },
  })
  it("rejects ingredient and preparation spread across separate menus", () => {
    const result = matchingDiscoveryMenus({
      place,
      menus: [fish, tofu],
      query: "",
      tag: "all",
      ingredient: "fish",
      cooking: "steamed",
    })
    expect(result).toEqual([])
  })
  it("returns only the menu matching every explicit condition", () => {
    const result = matchingDiscoveryMenus({
      place,
      menus: [fish, tofu],
      query: "생선",
      tag: "main_dish",
      ingredient: "fish",
      cooking: "grilled",
    })
    expect(result.map((menu) => menu.id)).toEqual([fish.id])
  })
  it("does not convert factual ingredients into a legacy nutrition tag", () => {
    const result = matchingDiscoveryMenus({ place, menus: [fish], query: "", tag: "protein" })
    expect(result).toEqual([])
  })
  it("rejects repeated optional share conditions", () => {
    const result = parseMapShareQuery(
      "q=&tag=all&lat=35.1&lng=129&z=12&ingredient=fish&ingredient=chicken",
    )
    expect(result).toBeNull()
  })
})

import { placeMapLabel } from "../../../components/map/menu-fact-presentation"

it("labels a populated search URL as search rather than an exact place", () => {
  const place = PlaceSchema.parse({
    ...V2_PLACE,
    naverPlaceUrl: `https://map.naver.com/p/search/${encodeURIComponent(`${V2_PLACE.name} ${V2_PLACE.address}`)}`,
  })
  const label = placeMapLabel(place)
  expect(label).toBe("네이버에서 검색")
})
