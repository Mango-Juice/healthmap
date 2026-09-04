import { describe, expect, it } from "vitest"
import { createPublicCatalogRepository } from "../../../lib/catalog/repository"
import { PublicCatalogSnapshotSchema } from "../../../lib/domain/catalog"
import { ProductionMenuSchema as LegacyMenuSchema } from "../../../lib/domain/catalog-v1"
import { V2_CATALOG, V2_MENU, V2_PLACE } from "./catalog-v2-fixture"
import { VALID_CATALOG_SNAPSHOT } from "./fixtures"

const read = (snapshot: unknown) =>
  createPublicCatalogRepository({
    getPublicCatalogSnapshot: async () => snapshot,
  }).getPublicCatalog()

describe("public catalog v2", () => {
  it("preserves an existing legacy snapshot without invented values", async () => {
    expect(await read(VALID_CATALOG_SNAPSHOT)).toEqual(VALID_CATALOG_SNAPSHOT)
  })
  it("requires v2 for facts without fabricated legacy health tags", async () => {
    expect(LegacyMenuSchema.safeParse(V2_MENU).success).toBe(false)
    expect(await read(V2_CATALOG)).toEqual(V2_CATALOG)
    expect(V2_MENU).not.toHaveProperty("healthTags")
  })
  it.each([
    { ...V2_CATALOG, rawReview: "private" },
    { ...V2_CATALOG, places: [{ ...V2_PLACE, primaryTag: "protein" }] },
    { ...V2_CATALOG, places: [{ ...V2_PLACE, latitude: 91 }] },
    { ...V2_CATALOG, menus: [{ ...V2_MENU, facts: { ...V2_MENU.facts, status: "candidate" } }] },
    { ...V2_CATALOG, menus: [{ ...V2_MENU, facts: { ...V2_MENU.facts, rawText: "private" } }] },
    { ...V2_CATALOG, menus: [{ ...V2_MENU, facts: { ...V2_MENU.facts, selection_reasons: [] } }] },
    { ...V2_CATALOG, menus: [{ ...V2_MENU, branchApplicability: "brand_common_unverified" }] },
    { ...V2_CATALOG, menus: [{ ...V2_MENU, healthTags: ["protein"] }] },
    { ...V2_CATALOG, menus: [{ ...V2_MENU, dataMode: "pilot" }] },
    { ...V2_CATALOG, menus: [{ ...V2_MENU, verifiedAt: "2026-12-01" }] },
    { ...V2_CATALOG, menus: VALID_CATALOG_SNAPSHOT.menus },
    { ...V2_CATALOG, schemaVersion: "1.0.0" },
  ])("rejects malformed versioned public input %#", async (snapshot) => {
    expect(PublicCatalogSnapshotSchema.safeParse(snapshot).success).toBe(false)
    await expect(read(snapshot)).rejects.toBeDefined()
  })
  it.each([
    { ...V2_CATALOG, places: [V2_PLACE, V2_PLACE] },
    { ...V2_CATALOG, menus: [V2_MENU, V2_MENU] },
    { ...V2_CATALOG, menus: [{ ...V2_MENU, published: false }] },
    { ...V2_CATALOG, menus: [] },
  ])("rejects invalid published snapshot integrity %#", async (snapshot) => {
    await expect(read(snapshot)).rejects.toBeDefined()
  })
})
