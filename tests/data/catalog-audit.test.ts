import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import catalog from "../../data/catalog.json"
import { auditCatalog } from "../../scripts/data/catalog-audit"
import { catalogSchema } from "../../scripts/data/catalog-schema"

const committedSeed = (): Promise<string> => readFile("supabase/seed.sql", "utf8")

describe("mock catalog boundary", () => {
  it("audits exactly five labeled mock places and ten menus", async () => {
    // Given: the committed mock catalog and its committed SQL seed.
    const seedSql = await committedSeed()

    // When: audit checks the complete persisted artifact.
    const result = auditCatalog({ catalog: catalogSchema.parse(catalog), seedSql })

    // Then: exact mock catalog parity and aggregate constraints hold.
    expect(result.errors).toEqual([])
    expect(result.placeCount).toBe(5)
    expect(result.menuCount).toBe(10)
    expect(result.tagDistribution).toMatchObject({
      vegetables: 4,
      protein: 3,
      balanced: 5,
      plant_based: 2,
    })
  })

  it.each([
    [
      "menu name",
      "Synthetic Fixture Name 15942763b9",
      "변조 메뉴명",
      "mock-sprout-square/bc6b1050-539e-4d28-8493-5920eae54248",
    ],
    [
      "menu UUID",
      "bc6b1050-539e-4d28-8493-5920eae54248",
      "90000000-0000-4000-8000-000000000099",
      "mock-sprout-square/bc6b1050-539e-4d28-8493-5920eae54248",
    ],
    ["place name", "Synthetic Fixture Name a5b9f8c226", "변조 장소명", "mock-sprout-square"],
  ])(
    "Given a committed seed with a mutated %s, when audited, then its record-specific parity error is reported",
    async (_label, original, replacement, record) => {
      // Given
      const seedSql = (await committedSeed()).replace(original, replacement)

      // When
      const result = auditCatalog({ catalog: catalogSchema.parse(catalog), seedSql })

      // Then
      expect(result.errors.some((error) => error.startsWith(`${record}:`))).toBe(true)
    },
  )

  it.each([
    ["an appended row", (seedSql: string) => `${seedSql}\n-- appended`],
    [
      "a reordered row",
      (seedSql: string) => seedSql.replace("'mock-sprout-square'", "'mock-rainbow-bowl'"),
    ],
  ])(
    "Given a committed seed with %s, when audited, then whole-file parity fails",
    async (_label, mutate) => {
      // Given
      const seedSql = mutate(await committedSeed())

      // When
      const result = auditCatalog({ catalog: catalogSchema.parse(catalog), seedSql })

      // Then
      expect(result.errors).toContain("seed: does not exactly match canonical generated SQL")
    },
  )

  it("rejects unmarked or legacy-shaped catalog records", () => {
    expect(() => catalogSchema.parse({ ...catalog, data_mode: "real" })).toThrow()
    expect(() =>
      catalogSchema.parse({ ...catalog, places: catalog.places.slice(0, 4) }),
    ).not.toThrow()
    const malformed = { ...catalog, places: [{ ...catalog.places[0], slug: "old-real-place" }] }
    expect(() => catalogSchema.parse(malformed)).toThrow()
  })

  it("rejects non-actionable boundary violations", () => {
    const malformed = {
      ...catalog,
      places: [
        { ...catalog.places[0], naver_place_url: "https://map.naver.com/p/entry/place/1" },
        ...catalog.places.slice(1),
      ],
    }
    expect(() => catalogSchema.parse(malformed)).toThrow()
  })
})
