import { describe, expect, it } from "vitest"
import type { Menu, Place } from "../../../lib/domain/catalog"
import { parseMenuRows, parsePlaceRows } from "../../../lib/domain/catalog"
import { filterDiscoveryPlaces, normalizeDiscoveryQuery } from "../../../lib/domain/discovery"
import { sortPlacesByDistance } from "../../../lib/domain/distance"
import { parseMapShareQuery, serializeMapShareQuery } from "../../../lib/domain/share-query"
import {
  applyCurrentViewport,
  createViewportState,
  recordViewportMovement,
  type ViewportBounds,
} from "../../../lib/domain/viewport"
import { VALID_MENU_ROW, VALID_PLACE_ROW } from "./fixtures"

const APPLIED_BOUNDS: ViewportBounds = {
  southWest: { latitude: 37.5, longitude: 127.0328 },
  northEast: { latitude: 37.501, longitude: 127.034 },
}

const CURRENT_BOUNDS: ViewportBounds = {
  southWest: { latitude: 37.499, longitude: 127.031 },
  northEast: { latitude: 37.504, longitude: 127.039 },
}

const places: readonly Place[] = parsePlaceRows([
  {
    ...VALID_PLACE_ROW,
    name: "그린테이블 강남점",
    latitude: 37.5,
    longitude: 127.0328,
  },
  {
    ...VALID_PLACE_ROW,
    id: "bede62e8-6e4d-4d3b-8227-34b73451b302",
    slug: "vegetable-house",
    name: "채소 하우스",
    latitude: 37.503,
    longitude: 127.038,
  },
  {
    ...VALID_PLACE_ROW,
    id: "c4e1cffb-2658-4ad4-8e38-c8c12a11c603",
    slug: "protein-kitchen",
    name: "단백질 키친",
    primary_tag: "protein",
    health_tags: ["protein"],
    latitude: 37.5,
    longitude: 127.033,
  },
])

const menus: readonly Menu[] = parseMenuRows([
  {
    ...VALID_MENU_ROW,
    name: "ＰＲＯＴＥＩＮ   Bowl",
  },
  {
    ...VALID_MENU_ROW,
    id: "f6a43353-4f04-4384-86ea-c145918e9502",
    place_id: "bede62e8-6e4d-4d3b-8227-34b73451b302",
    name: "Protein bowl",
  },
])

describe("discovery search and viewport filtering", () => {
  it("Given Unicode query tokens, one tag, and applied bounds, when filtering, then only matching places in the inclusive bounds remain", () => {
    // Given
    const frozenPlaces = Object.freeze([...places])
    const frozenMenus = Object.freeze([...menus])

    // When
    const result = filterDiscoveryPlaces({
      places: frozenPlaces,
      menus: frozenMenus,
      query: "  ＰＲＯＴＥＩＮ　BOWL  ",
      tag: "vegetables",
      appliedBounds: APPLIED_BOUNDS,
    })

    // Then
    expect(normalizeDiscoveryQuery("  ＰＲＯＴＥＩＮ　BOWL  ")).toBe("protein bowl")
    expect(result.map((place) => place.slug)).toEqual(["green-table-gangnam"])
    expect(frozenPlaces).toEqual(places)
    expect(frozenMenus).toEqual(menus)
  })

  it("Given map movement before a user applies it, when viewport state changes, then filtering keeps the previous applied bounds", () => {
    // Given
    const initial = createViewportState(APPLIED_BOUNDS)

    // When
    const moved = recordViewportMovement(initial, CURRENT_BOUNDS)
    const applied = applyCurrentViewport(moved)

    // Then
    expect(moved).toEqual({ currentBounds: CURRENT_BOUNDS, appliedBounds: APPLIED_BOUNDS })
    expect(applied).toEqual({ currentBounds: CURRENT_BOUNDS, appliedBounds: CURRENT_BOUNDS })
  })
})

describe("discovery distance sorting", () => {
  it("Given no user location and equal distances from the applied center, when sorting, then Korean names and IDs break ties deterministically", () => {
    // Given
    const tiedPlaces: readonly Place[] = parsePlaceRows([
      {
        ...VALID_PLACE_ROW,
        id: "c4e1cffb-2658-4ad4-8e38-c8c12a11c603",
        slug: "same-name-later-id",
        name: "가게",
        latitude: 37.5,
        longitude: 127.034,
      },
      {
        ...VALID_PLACE_ROW,
        id: "bede62e8-6e4d-4d3b-8227-34b73451b302",
        slug: "same-name-earlier-id",
        name: "가게",
        latitude: 37.5,
        longitude: 127.034,
      },
      {
        ...VALID_PLACE_ROW,
        id: "75708968-2839-4eba-8b44-f613de821d04",
        slug: "later-korean-name",
        name: "나무",
        latitude: 37.5,
        longitude: 127.0316,
      },
    ])

    // When
    const result = sortPlacesByDistance({ places: tiedPlaces, appliedBounds: APPLIED_BOUNDS })

    // Then
    expect(result.map(({ place }) => place.slug)).toEqual([
      "same-name-earlier-id",
      "same-name-later-id",
      "later-korean-name",
    ])
  })

  it("Given a user location, when sorting, then it takes precedence over the applied map center", () => {
    // Given
    const distancePlaces: readonly Place[] = parsePlaceRows([
      {
        ...VALID_PLACE_ROW,
        id: "4ebaeeac-274e-494f-84ad-6ce34a48b605",
        slug: "near-user",
        name: "사용자 근처",
        latitude: 37.5,
        longitude: 127.034,
      },
      {
        ...VALID_PLACE_ROW,
        id: "e68ddcb7-30bb-4e00-811c-b47303a73906",
        slug: "near-center",
        name: "중심 근처",
        latitude: 37.5,
        longitude: 127.0328,
      },
    ])

    // When
    const result = sortPlacesByDistance({
      places: distancePlaces,
      appliedBounds: APPLIED_BOUNDS,
      userLocation: { latitude: 37.5, longitude: 127.034 },
    })

    // Then
    expect(result.map(({ place }) => place.slug)).toEqual(["near-user", "near-center"])
  })
})

describe("map share query", () => {
  it("Given a serializable map state, when encoded and parsed, then only canonical map keys and normalized query state round trip", () => {
    // Given
    const state = {
      q: "  ＰＲＯＴＥＩＮ　BOWL  ",
      tag: "protein",
      lat: 37.5,
      lng: 127.0328,
      z: 15,
    } as const

    // When
    const query = serializeMapShareQuery(state)
    const result = parseMapShareQuery(query)

    // Then
    expect(query).toBe("q=protein+bowl&tag=protein&lat=37.5&lng=127.0328&z=15")
    expect(result).toEqual({ ...state, q: "protein bowl" })
  })

  it("Given duplicate, extra, or malformed query values, when parsing, then no share state is returned", () => {
    // Given
    const invalidQueries = [
      "q=protein&q=duplicate&tag=protein&lat=37.5&lng=127.0328&z=15",
      "q=protein&tag=protein&lat=37.5&lng=127.0328&z=15&src=legacy",
      "q=protein&tag=protein&lat=not-a-number&lng=127.0328&z=15",
      "q=protein&tag=protein&lat=&lng=127.0328&z=15",
    ] as const

    // When
    const result = invalidQueries.map(parseMapShareQuery)

    // Then
    expect(result).toEqual([null, null, null, null])
  })

  it("Given out-of-bounds centers or exact locked bounds, when parsing map shares, then only valid global coordinates are accepted", () => {
    // Given
    const outOfBounds = [
      "q=&tag=all&lat=91&lng=0&z=15",
      "q=&tag=all&lat=-90.1&lng=127.02&z=15",
      "q=&tag=all&lat=37.492&lng=180.1&z=15",
    ] as const
    const inclusiveBounds = [
      "q=&tag=all&lat=37.492&lng=127.02&z=15",
      "q=&tag=all&lat=37.5085&lng=127.0445&z=15",
    ] as const

    // When
    const rejected = outOfBounds.map(parseMapShareQuery)
    const accepted = inclusiveBounds.map(parseMapShareQuery)

    // Then
    expect(rejected).toEqual([null, null, null])
    expect(accepted).toEqual([
      { q: "", tag: "all", lat: 37.492, lng: 127.02, z: 15 },
      { q: "", tag: "all", lat: 37.5085, lng: 127.0445, z: 15 },
    ])
  })
})
