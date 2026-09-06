import { describe, expect, it } from "vitest"
import { currentPilotCatalog, PilotCatalogSchema } from "../../lib/pilot/catalog"
import { syntheticPilotCatalog } from "../fixtures/pilot-catalog"

const catalog = syntheticPilotCatalog
describe("Pilot menu-fact boundary", () => {
  it("removes expired source menus at request time even without regenerating the snapshot", () => {
    expect(currentPilotCatalog(catalog, Date.parse("2028-01-01T00:00:00Z")).places).toEqual([])
  })
  it("keeps synthetic unapproved candidates without a price prerequisite", () => {
    expect(catalog.places.every((place) => place.reviewStatus === "candidate")).toBe(true)
    expect(catalog.menus.every((menu) => !("priceKrw" in menu))).toBe(true)
    expect(catalog.places.length).toBeGreaterThan(0)
    expect(catalog.menus.length).toBeGreaterThan(0)
    expect(catalog.menus.every((menu) => menu.facts.status === "candidate")).toBe(true)
  })
  it("rejects production approval-like state", () => {
    expect(
      PilotCatalogSchema.safeParse({
        ...catalog,
        places: catalog.places.map((place) => ({ ...place, published: true })),
      }).success,
    ).toBe(false)
  })
  it("rejects duplicate menu IDs and expired evidence", () => {
    expect(
      PilotCatalogSchema.safeParse({ ...catalog, menus: [...catalog.menus, ...catalog.menus] })
        .success,
    ).toBe(false)
    expect(PilotCatalogSchema.safeParse({ ...catalog, asOf: "2028-01-01T00:00:00Z" }).success).toBe(
      false,
    )
  })
  it("rejects source-free menus and orphaned menu parents", () => {
    const menu = catalog.menus[0]
    if (menu === undefined) throw new Error("expected a synthetic menu fixture")
    expect(
      PilotCatalogSchema.safeParse({
        ...catalog,
        menus: catalog.menus.map((candidate) =>
          candidate.id === menu.id ? { ...candidate, evidence: [] } : candidate,
        ),
      }).success,
    ).toBe(false)
    expect(
      PilotCatalogSchema.safeParse({
        ...catalog,
        places: catalog.places.filter((place) => place.id !== menu.placeId),
      }).success,
    ).toBe(false)
  })
  it("accepts official Bon Dosirak evidence and rejects unsafe host or query variants", () => {
    const menu = catalog.menus[0]
    if (menu === undefined) throw new Error("expected a synthetic menu fixture")
    const withEvidenceUrl = (evidenceUrl: string) => ({
      ...catalog,
      places: catalog.places.map((place) =>
        place.id === menu.placeId ? { ...place, sources: ["bon_dosirak"] } : place,
      ),
      menus: catalog.menus.map((candidate) =>
        candidate.id === menu.id
          ? {
              ...candidate,
              evidence: candidate.evidence.map((evidence, index) =>
                index === 0 ? { ...evidence, source: "bon_dosirak", evidenceUrl } : evidence,
              ),
            }
          : candidate,
      ),
    })

    expect(
      PilotCatalogSchema.safeParse(
        withEvidenceUrl("https://www.api.bonif.co.kr/brand/v1/synthetic-0480c5d0ad?brdCd=TEST906&cmdtCateIdx=&orderBy=="),
      ).success,
    ).toBe(true)
    expect(
      PilotCatalogSchema.safeParse(
        withEvidenceUrl("https://api.bonif.co.kr.evil.example/brand/v1/menu?brdCd=BF104"),
      ).success,
    ).toBe(false)
    expect(
      PilotCatalogSchema.safeParse(
        withEvidenceUrl("https://api.bonif.co.kr/brand/v1/menu?brdCd=BF104&access_token=forged"),
      ).success,
    ).toBe(false)
    expect(
      PilotCatalogSchema.safeParse(
        withEvidenceUrl("https://api.bonif.co.kr:444/brand/v1/menu?brdCd=BF104"),
      ).success,
    ).toBe(false)
    expect(
      PilotCatalogSchema.safeParse(
        withEvidenceUrl("https://api.bonif.co.kr/brand/v1/menu?brdCd=BF104&access.token=forged"),
      ).success,
    ).toBe(false)
    expect(
      PilotCatalogSchema.safeParse(
        withEvidenceUrl("https://operator@api.bonif.co.kr/brand/v1/menu?brdCd=BF104"),
      ).success,
    ).toBe(false)
    expect(PilotCatalogSchema.safeParse(withEvidenceUrl("not-a-url")).success).toBe(false)
    const unknownSource = withEvidenceUrl("https://api.bonif.co.kr/brand/v1/menu?brdCd=BF104")
    expect(
      PilotCatalogSchema.safeParse({
        ...unknownSource,
        places: unknownSource.places.map((place) =>
          place.id === menu.placeId ? { ...place, sources: ["unknown_bon_brand"] } : place,
        ),
      }).success,
    ).toBe(false)
  })
})
