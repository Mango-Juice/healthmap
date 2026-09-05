import { readFile } from "node:fs/promises"
import { describe, expect, test } from "vitest"
import { currentPilotCatalog, PilotCatalogSchema } from "../../lib/pilot/catalog"

describe("snapshot candidate", () => {
  test("passes the app schema and reports raw and current selection counts", async () => {
    const candidatePath = process.env["HEALTHMAP_CANDIDATE_PATH"]
    const evaluationTime = process.env["HEALTHMAP_EVALUATION_TIME"]
    expect(candidatePath, "HEALTHMAP_CANDIDATE_PATH must be explicit").toBeTruthy()
    expect(evaluationTime, "HEALTHMAP_EVALUATION_TIME must be explicit").toBeTruthy()

    const catalog = PilotCatalogSchema.parse(
      JSON.parse(await readFile(candidatePath as string, "utf8")),
    )
    const evaluationTimestamp = Date.parse(evaluationTime as string)
    expect(Number.isFinite(evaluationTimestamp)).toBe(true)
    const current = currentPilotCatalog(catalog, evaluationTimestamp)
    const report = {
      catalogVersion: catalog.catalogVersion,
      rawPlaces: catalog.places.length,
      rawMenus: catalog.menus.length,
      selectablePlaces: current.places.length,
      selectableMenus: current.menus.length,
      expiredMenus: catalog.menus.length - current.menus.length,
    }
    expect(report.rawPlaces).toBeGreaterThan(0)
    expect(report.rawMenus).toBeGreaterThan(0)
    expect(report.selectablePlaces).toBeGreaterThan(0)
    console.log(JSON.stringify(report))
  })
})
