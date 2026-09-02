import { expect, test } from "@playwright/test"
import {
  assertHostedReleaseCatalog,
  readExpectedHostedCatalogVersion,
} from "./hosted-release-contract.ts"

test.skip(!process.env["E2E_BASE_URL"], "hosted release contract only runs in hosted mode")

test("hosted release exposes root, privacy, promoted catalog, and method boundary", async ({
  page,
  request,
}) => {
  const expectedCatalogVersion = readExpectedHostedCatalogVersion()
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "건강식 지도" })).toBeVisible()
  await page.goto("/privacy")
  await expect(page.getByRole("heading", { name: "개인정보 및 분석 안내" })).toBeVisible()

  const catalogResponse = await request.get("/api/map-catalog")
  expect(catalogResponse.status()).toBe(200)
  assertHostedReleaseCatalog(await catalogResponse.json(), { expectedCatalogVersion })

  const postResponse = await request.post("/api/map-catalog")
  expect(postResponse.status()).toBe(405)
})
