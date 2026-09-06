import { describe, expect, it } from "vitest"
import { MenuIdSchema, PlaceIdSchema, PlaceSlugSchema } from "../../../lib/domain/contracts"

describe("branded domain primitives", () => {
  it("Given boundary strings, when parsed, then IDs require UUIDs and slugs require canonical form", () => {
    // Given
    const inputs = {
      placeId: "bc6b1050-539e-4d28-8493-5920eae54201",
      menuId: "2a8039ba-6862-4bf5-882c-298892e7ca01",
      slug: "green-table-gangnam",
    }

    // When
    const valid = {
      placeId: PlaceIdSchema.safeParse(inputs.placeId).success,
      menuId: MenuIdSchema.safeParse(inputs.menuId).success,
      slug: PlaceSlugSchema.safeParse(inputs.slug).success,
    }

    // Then
    expect(valid).toEqual({ placeId: true, menuId: true, slug: true })
    expect(PlaceIdSchema.safeParse("green-table-gangnam").success).toBe(false)
    expect(MenuIdSchema.safeParse("10000000").success).toBe(false)
    expect(PlaceSlugSchema.safeParse("Green Table Gangnam").success).toBe(false)
  })
})
