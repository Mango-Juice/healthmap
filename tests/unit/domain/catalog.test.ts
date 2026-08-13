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
        },
      ],
    })
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
