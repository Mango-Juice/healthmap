import { describe, expect, it } from "vitest"
import { parseMenuRows, parsePlaceRows } from "../../../lib/domain/catalog"
import { VALID_MENU_ROW, VALID_PLACE_ROW } from "./fixtures"

describe("catalog domain boundary", () => {
  it("Given strict Supabase rows, when parsed, then readonly camel-case domain records cross the boundary", () => {
    // Given
    const placeRows: readonly unknown[] = [VALID_PLACE_ROW]
    const menuRows: readonly unknown[] = [VALID_MENU_ROW]

    // When
    const result = { places: parsePlaceRows(placeRows), menus: parseMenuRows(menuRows) }

    // Then
    expect(result).toEqual({
      places: [
        {
          id: VALID_PLACE_ROW.id,
          slug: VALID_PLACE_ROW.slug,
          name: VALID_PLACE_ROW.name,
          address: VALID_PLACE_ROW.address,
          latitude: VALID_PLACE_ROW.latitude,
          longitude: VALID_PLACE_ROW.longitude,
          naverPlaceUrl: VALID_PLACE_ROW.naver_place_url,
          primaryTag: VALID_PLACE_ROW.primary_tag,
          healthTags: VALID_PLACE_ROW.health_tags,
          published: true,
          dataMode: "production",
        },
      ],
      menus: [
        {
          id: VALID_MENU_ROW.id,
          placeId: VALID_MENU_ROW.place_id,
          name: VALID_MENU_ROW.name,
          healthTags: VALID_MENU_ROW.health_tags,
          evidenceUrl: VALID_MENU_ROW.evidence_url,
          verifiedAt: VALID_MENU_ROW.verified_at,
          displayOrder: 0,
          published: true,
          dataMode: "production",
        },
      ],
    })
  })

  it("Given all committed mock rows, when parsed, then dataMode is retained", async () => {
    // Given
    const catalog = (await import("../../../data/catalog.json")).default
    const placeRows = catalog.places.map(
      ({ menus: _menus, marker_offset: _markerOffset, ...place }) => ({
        ...place,
        data_mode: catalog.data_mode,
      }),
    )
    const menuRows = catalog.places.flatMap((place) =>
      place.menus.map((menu) => ({ ...menu, place_id: place.id, data_mode: catalog.data_mode })),
    )

    // When
    const result = { places: parsePlaceRows(placeRows), menus: parseMenuRows(menuRows) }

    // Then
    expect(result.places).toHaveLength(5)
    expect(result.menus).toHaveLength(10)
    expect(result.places.every((place) => place.dataMode === "mock")).toBe(true)
    expect(result.menus.every((menu) => menu.dataMode === "mock")).toBe(true)
  })

  it("Given rows without mode or with an invalid mode/url pairing, when parsed, then they are rejected", () => {
    // Given
    const invalidPlaces = [
      { ...VALID_PLACE_ROW, data_mode: undefined },
      {
        ...VALID_PLACE_ROW,
        data_mode: "mock",
        slug: "mock-place",
        naver_place_url: VALID_PLACE_ROW.naver_place_url,
      },
    ]
    const invalidMenus = [
      { ...VALID_MENU_ROW, data_mode: undefined },
      {
        ...VALID_MENU_ROW,
        evidence_url: "https://example.invalid/mock-evidence/mock-menu",
        data_mode: "production",
      },
    ]

    // When
    const attempts = [
      ...invalidPlaces.map((row) => () => parsePlaceRows([row])),
      ...invalidMenus.map((row) => () => parseMenuRows([row])),
    ]

    // Then
    for (const attempt of attempts) expect(attempt).toThrow()
  })

  it("Given malformed or unknown catalog fields, when parsed, then raw input is rejected", () => {
    // Given
    const malformedRows: readonly unknown[] = [
      { ...VALID_PLACE_ROW, health_tags: ["balanced", "medical_claim"] },
      { ...VALID_PLACE_ROW, primary_tag: "protein" },
      { ...VALID_PLACE_ROW, unexpected: "raw-data-leak" },
      { ...VALID_PLACE_ROW, latitude: 37.4919 },
    ]

    // When
    const attempts = malformedRows.map((row) => () => parsePlaceRows([row]))

    // Then
    for (const attempt of attempts) expect(attempt).toThrow()
  })
})
