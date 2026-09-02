import assert from "node:assert/strict"
import { test } from "node:test"
import { runProductionSmoke } from "../../scripts/deploy/production-smoke.mjs"
import { createProductionCatalog, createProductionFetch } from "./catalog-fixture.mjs"

const baseUrl = new URL("https://healthmap.example.test")
const currentDate = "2026-08-22"
const expectedCatalogVersion = "catalog-2026-08-22"

const run = (catalog) =>
  runProductionSmoke(baseUrl, createProductionFetch(catalog), {
    currentDate,
    expectedCatalogVersion,
  })

test("smoke rejects 99 otherwise-valid current places", async () => {
  await assert.rejects(() => run(createProductionCatalog({ count: 99 })), /at least 100/)
})

test("smoke rejects duplicate place IDs", async () => {
  const catalog = createProductionCatalog()
  catalog.places[99] = { ...catalog.places[99], id: catalog.places[0].id }
  await assert.rejects(() => run(catalog), /unique place IDs/)
})

test("smoke rejects a place without a current valid menu", async () => {
  const catalog = createProductionCatalog()
  catalog.menus = catalog.menus.slice(0, 99)
  await assert.rejects(() => run(catalog), /current valid published menu/)
})

test("smoke rejects otherwise-current menus verified after the smoke date", async () => {
  const catalog = createProductionCatalog()
  catalog.menus = catalog.menus.map((menu) => ({ ...menu, verifiedAt: "2026-08-23" }))
  await assert.rejects(() => run(catalog), /date-validity/)
})

test("smoke accepts menu evidence through its inclusive valid-until date", async () => {
  const catalog = createProductionCatalog({ validUntil: "2026-08-22" })
  assert.equal(await run(catalog), "Production smoke passed")
})

test("smoke rejects menu evidence after its inclusive valid-until date", async () => {
  const catalog = createProductionCatalog({ validUntil: "2026-08-21" })
  catalog.menus = catalog.menus.map((menu) => ({ ...menu, verifiedAt: "2026-08-20" }))
  await assert.rejects(() => run(catalog), /current valid published menu/)
})

test("smoke rejects wrong catalog version and unknown keys", async () => {
  const missingVersion = createProductionCatalog()
  delete missingVersion.catalogVersion
  await assert.rejects(() => run(missingVersion), /strict catalog contract/)

  const unknownKey = { ...createProductionCatalog(), serviceRole: "redacted" }
  await assert.rejects(() => run(unknownKey), /credential-shaped value|strict catalog contract/)
})

test("smoke rejects an otherwise-current catalog when it does not match the promoted version", async () => {
  await assert.rejects(
    () =>
      runProductionSmoke(baseUrl, createProductionFetch(createProductionCatalog()), {
        currentDate,
        expectedCatalogVersion: "catalog-2026-08-23",
      }),
    /catalog version mismatch/,
  )
})

test("smoke requires a valid expected promoted catalog version", async () => {
  await assert.rejects(
    () =>
      runProductionSmoke(baseUrl, createProductionFetch(createProductionCatalog()), {
        currentDate,
      }),
    /expected catalog version must be a catalog version/,
  )
})

test("smoke accepts exactly 100 unique current production places with one menu each", async () => {
  assert.equal(await run(createProductionCatalog()), "Production smoke passed")
})
