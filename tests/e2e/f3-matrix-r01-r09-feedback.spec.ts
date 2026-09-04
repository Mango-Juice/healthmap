import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import type { Page, Route, TestInfo } from "@playwright/test"
import {
  catalogQueryPattern,
  emptyQueryCatalog,
  fulfillCatalogQuery,
} from "./catalog-query-fixture"
import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              accuracy: 5,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              latitude: 37.5007,
              longitude: 127.0328,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          }),
      },
    })
  })
})

const sourcePath = new URL("./f3-matrix-r01-r09-feedback.spec.ts", import.meta.url)
const sha256 = async (path: string | URL): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")
const run = async (
  rowId: string,
  page: Page,
  testInfo: TestInfo,
  observed: unknown,
  consoleErrors: readonly string[],
): Promise<void> => {
  const png = testInfo.outputPath(`${rowId}.png`)
  await page.screenshot({ path: png, fullPage: false })
  const metadata = {
    artifact: `${rowId}.png`,
    buildId: process.env["F3_BUILD_ID"] ?? "S2m8_RnjLdQT5-_DHb3I2",
    consoleErrors,
    captureTimestamp: new Date().toISOString(),
    observed,
    rowId,
    screenshotSha256: await sha256(png),
    screenshotSha: await sha256(png),
    sourceSha256: await sha256(sourcePath),
    sourceManifestReference:
      ".omo/evidence/f3-final/surface-matrix.json#baseline.sourceManifestSha256",
    sourceManifestSha256: "227f168eb3c1a35e66d9c4f85dbe29f9ff82270e46f07ac315df27d83492b107",
    testId: testInfo.testId,
    url: page.url(),
  }
  const json = testInfo.outputPath(`${rowId}.json`)
  await writeFile(json, `${JSON.stringify(metadata, null, 2)}\n`)
  await testInfo.attach(`${rowId}.png`, { contentType: "image/png", path: png })
  await testInfo.attach(`${rowId}.json`, { contentType: "application/json", path: json })
}
const setup = async (page: Page): Promise<readonly Route[]> => {
  await page.goto("/")
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await expect(page.getByText("장소 데이터를 불러오는 중입니다.")).toHaveCount(0)
  const requests: Route[] = []
  await page.route(catalogQueryPattern, async (route) => {
    requests.push(route)
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect.poll(() => requests.length).toBe(1)
  return requests
}
test("R07 held refresh shows loading over prior markers", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  const requests = await setup(page)
  const observed = {
    loading: await page.getByText("장소 데이터를 불러오는 중입니다.").isVisible(),
    markers: await page.locator("[data-test-naver-marker='true']").count(),
    feedbackAboveTray: await page.evaluate(() => {
      const f = document.querySelector<HTMLElement>("[class*='catalogFeedback']")
      const t = document.querySelector<HTMLElement>("[aria-label='검색 결과 패널']")
      return (
        f !== null &&
        t !== null &&
        f.getBoundingClientRect().bottom <= t.getBoundingClientRect().top
      )
    }),
  }
  expect(observed).toEqual({ loading: true, markers: 5, feedbackAboveTray: true })
  await run("R07", page, testInfo, observed, consoleErrors)
  await requests[0]?.abort()
})
test("R08 production empty catalog shows empty state", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  const requests = await setup(page)
  const emptyRequest = requests[0]
  if (emptyRequest === undefined) throw new TypeError("Missing empty query request")
  await fulfillCatalogQuery(emptyRequest, emptyQueryCatalog)
  await expect(page.getByText("표시할 장소가 없습니다.")).toBeVisible()
  const observed = {
    empty: await page.getByText("표시할 장소가 없습니다.").innerText(),
    markers: await page.locator("[data-test-naver-marker='true']").count(),
  }
  expect(observed).toEqual({ empty: "표시할 장소가 없습니다.", markers: 0 })
  await run("R08", page, testInfo, observed, consoleErrors)
})
test("R09 refresh 503 preserves prior markers with error", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  const requests = await setup(page)
  await requests[0]?.fulfill({ status: 503 })
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toBeVisible()
  const observed = {
    error: await page.getByText("장소 데이터를 불러오지 못했습니다.").innerText(),
    markers: await page.locator("[data-test-naver-marker='true']").count(),
    retryVisible: await page.getByRole("button", { name: "장소 새로고침" }).isVisible(),
    injectedFailure: { route: "/api/map-catalog/query", status: 503 },
    unexpectedConsoleErrors: consoleErrors.filter(
      (error) => !error.includes("/api/map-catalog/query") && !error.includes("503"),
    ),
  }
  expect(observed).toEqual({
    error: "장소 데이터를 불러오지 못했습니다.",
    markers: 5,
    retryVisible: true,
    injectedFailure: { route: "/api/map-catalog/query", status: 503 },
    unexpectedConsoleErrors: [],
  })
  await run("R09", page, testInfo, observed, consoleErrors)
})
