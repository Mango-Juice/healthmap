import assert from "node:assert/strict"
import { test } from "node:test"
import {
  assertHostedReleaseCatalog,
  readExpectedHostedCatalogVersion,
} from "../e2e/hosted-release-contract.ts"
import { createProductionCatalog } from "./catalog-fixture.mjs"

test("hosted release fails closed without the promoted catalog version", () => {
  assert.throws(
    () => readExpectedHostedCatalogVersion({}),
    /E2E_EXPECTED_CATALOG_VERSION is required/,
  )
})

test("hosted release accepts more than 100 unique current places", () => {
  const catalog = createProductionCatalog({ count: 101, validUntil: "2026-08-22" })

  assert.doesNotThrow(() =>
    assertHostedReleaseCatalog(catalog, {
      currentDate: "2026-08-22",
      expectedCatalogVersion: catalog.catalogVersion,
    }),
  )
})

test("hosted release rejects menus verified after the release date", () => {
  const catalog = createProductionCatalog({ validUntil: "2026-11-20" })
  catalog.menus = catalog.menus.map((menu) => ({ ...menu, verifiedAt: "2026-08-23" }))

  assert.throws(
    () =>
      assertHostedReleaseCatalog(catalog, {
        currentDate: "2026-08-22",
        expectedCatalogVersion: catalog.catalogVersion,
      }),
    /current valid published menu per place/,
  )
})

test("hosted release rejects wrong version, duplicate places, and missing current menus", () => {
  const catalog = createProductionCatalog({ count: 100, validUntil: "2026-08-22" })
  assert.throws(
    () =>
      assertHostedReleaseCatalog(catalog, {
        currentDate: "2026-08-22",
        expectedCatalogVersion: "different-promoted-version",
      }),
    /catalog version mismatch/,
  )

  const duplicate = structuredClone(catalog)
  duplicate.places[99].id = duplicate.places[0].id
  assert.throws(
    () =>
      assertHostedReleaseCatalog(duplicate, {
        currentDate: "2026-08-22",
        expectedCatalogVersion: catalog.catalogVersion,
      }),
    /unique place IDs/,
  )

  const menuLess = structuredClone(catalog)
  menuLess.menus = menuLess.menus.filter((menu) => menu.placeId !== menuLess.places[99].id)
  assert.throws(
    () =>
      assertHostedReleaseCatalog(menuLess, {
        currentDate: "2026-08-22",
        expectedCatalogVersion: catalog.catalogVersion,
      }),
    /current valid published menu per place/,
  )
})
