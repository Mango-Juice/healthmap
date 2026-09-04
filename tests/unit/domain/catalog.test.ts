import { describe, expect, it } from "vitest"
import {
  PublicCatalogSnapshotSchema,
  parseMenuRows,
  parsePlaceRows,
} from "../../../lib/domain/catalog"
import { VALID_CATALOG_SNAPSHOT, VALID_MENU_ROW, VALID_PLACE_ROW } from "./fixtures"

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
          verificationMethod: VALID_MENU_ROW.verification_method,
          verifiedAt: VALID_MENU_ROW.verified_at,
          validUntil: VALID_MENU_ROW.valid_until,
          displayOrder: 0,
          published: true,
          dataMode: "production",
        },
      ],
    })
  })

  it("Given rows without production mode, when parsed, then they are rejected", () => {
    // Given
    const invalidPlaces = [
      { ...VALID_PLACE_ROW, data_mode: undefined },
      {
        ...VALID_PLACE_ROW,
        data_mode: "sample",
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
      { ...VALID_PLACE_ROW, latitude: 90.001 },
    ]

    // When
    const attempts = malformedRows.map((row) => () => parsePlaceRows([row]))

    // Then
    for (const attempt of attempts) expect(attempt).toThrow()
  })

  it("Given production URLs with userinfo, when parsed, then the public provenance boundary rejects them", () => {
    // Given
    const hostilePlace = {
      ...VALID_PLACE_ROW,
      naver_place_url: "https://user:password@map.naver.com/p/place/1",
    }
    const hostileMenu = {
      ...VALID_MENU_ROW,
      evidence_url: "https://user:password@sources.example.test/evidence/1",
    }

    // When / Then
    expect(() => parsePlaceRows([hostilePlace])).toThrow()
    expect(() => parseMenuRows([hostileMenu])).toThrow()
  })

  it("Given verification methods and validity windows, when parsed, then evidence rules are enforced", () => {
    const validDirectConfirmation = {
      ...VALID_MENU_ROW,
      evidence_url: null,
      verification_method: "direct_confirmation",
    }
    const invalidRows = [
      { ...VALID_MENU_ROW, evidence_url: null, verification_method: "government_exact" },
      { ...VALID_MENU_ROW, verification_method: "direct_confirmation" },
      { ...VALID_MENU_ROW, valid_until: VALID_MENU_ROW.verified_at },
      { ...VALID_MENU_ROW, valid_until: "2027-02-10" },
    ]

    expect(parseMenuRows([validDirectConfirmation])).toHaveLength(1)
    for (const row of invalidRows) expect(() => parseMenuRows([row])).toThrow()
  })

  it("Given valid HTTPS and nullable direct-confirmation evidence, when safely parsed, then both succeed", () => {
    // Given
    const directConfirmationCatalog = {
      ...VALID_CATALOG_SNAPSHOT,
      menus: [
        {
          ...VALID_CATALOG_SNAPSHOT.menus[0],
          evidenceUrl: null,
          verificationMethod: "direct_confirmation",
        },
      ],
    }

    // When
    const validHttps = PublicCatalogSnapshotSchema.safeParse(VALID_CATALOG_SNAPSHOT)
    const nullableDirectConfirmation =
      PublicCatalogSnapshotSchema.safeParse(directConfirmationCatalog)

    // Then
    expect(validHttps.success).toBe(true)
    expect(nullableDirectConfirmation.success).toBe(true)
  })

  it("Given a malformed evidence URL, when safely parsed, then parsing fails without throwing", () => {
    // Given
    const malformedCatalog = {
      ...VALID_CATALOG_SNAPSHOT,
      menus: [{ ...VALID_CATALOG_SNAPSHOT.menus[0], evidenceUrl: "not a URL" }],
    }

    // When
    const parse = () => PublicCatalogSnapshotSchema.safeParse(malformedCatalog)

    // Then
    expect(parse).not.toThrow()
    expect(parse().success).toBe(false)
  })

  it("Given credential-bearing or unsafe evidence URLs, when safely parsed, then both are rejected", () => {
    // Given
    const inputs = [
      "https://user:password@sources.example.test/evidence/1",
      "http://sources.example.test/evidence/1",
    ]

    // When
    const results = inputs.map((evidenceUrl) =>
      PublicCatalogSnapshotSchema.safeParse({
        ...VALID_CATALOG_SNAPSHOT,
        menus: [{ ...VALID_CATALOG_SNAPSHOT.menus[0], evidenceUrl }],
      }),
    )

    // Then
    expect(results.every((result) => !result.success)).toBe(true)
  })

  it("Given an unknown public field, when safely parsed, then strict parsing rejects it", () => {
    // Given
    const catalogWithUnknownField = { ...VALID_CATALOG_SNAPSHOT, unexpected: "private" }

    // When
    const result = PublicCatalogSnapshotSchema.safeParse(catalogWithUnknownField)

    // Then
    expect(result.success).toBe(false)
  })
})
