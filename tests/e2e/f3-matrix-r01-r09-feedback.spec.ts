import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import type { Page, Route, TestInfo } from "@playwright/test"
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
type HeldQuery = {
  readonly initialVisibleResults: number
  readonly requests: readonly Route[]
}

const setup = async (page: Page): Promise<HeldQuery> => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const resultCount = page.getByLabel("검색 결과 수")
  await expect(resultCount).toHaveText(/^\d+곳 중 \d+곳$/u)
  const reportedCounts = /^([0-9]+)곳 중 ([0-9]+)곳$/u.exec(await resultCount.innerText())
  if (!reportedCounts) throw new TypeError("Visible Pilot result count is unavailable")
  const initialVisibleResults = Number(reportedCounts[2])
  expect(initialVisibleResults).toBeGreaterThan(0)
  await expect(page.locator("[data-pilot-place-id]")).toHaveCount(initialVisibleResults)
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(initialVisibleResults)
  const requests: Route[] = []
  await page.route("**/api/places?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "places")
      return route.continue()
    requests.push(route)
  })
  await page.getByRole("searchbox", { name: "가게나 메뉴 검색" }).fill("보류")
  await expect.poll(() => requests.length).toBe(1)
  return { initialVisibleResults, requests }
}
test("R07 held query clears obsolete markers while the current result set loads", async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  const heldQuery = await setup(page)
  const observed = {
    loading: await page.getByText("메뉴를 찾고 있어요.").isVisible(),
    markers: await page.locator("[data-test-naver-marker='true']").count(),
    results: await page.locator("[data-pilot-place-id]").count(),
  }
  expect(heldQuery.initialVisibleResults).toBeGreaterThan(0)
  expect(observed).toEqual({ loading: true, markers: 0, results: 0 })
  await run("R07", page, testInfo, observed, consoleErrors)
  const request = heldQuery.requests[0]
  if (request === undefined) throw new TypeError("Missing held Pilot places request")
  await request.abort()
})
test("R08 empty Pilot response shows the current empty state", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  const heldQuery = await setup(page)
  const emptyRequest = heldQuery.requests[0]
  if (emptyRequest === undefined) throw new TypeError("Missing empty query request")
  await emptyRequest.fulfill({
    json: { catalogVersion: "empty-e2e", nextCursor: null, results: [], total: 0 },
  })
  await expect(page.getByText("찾으시는 메뉴가 아직 없어요.")).toBeVisible()
  const observed = {
    markers: await page.locator("[data-test-naver-marker='true']").count(),
  }
  expect(observed).toEqual({ markers: 0 })
  await run("R08", page, testInfo, observed, consoleErrors)
})
test("R09 Pilot query 503 exposes a retry action", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  const heldQuery = await setup(page)
  const request = heldQuery.requests[0]
  if (request === undefined) throw new TypeError("Missing failed Pilot places request")
  await request.fulfill({ status: 503 })
  await expect(page.getByText("메뉴를 불러오지 못했어요.")).toBeVisible()
  const observed = {
    error: await page.getByText("메뉴를 불러오지 못했어요.").innerText(),
    markers: await page.locator("[data-test-naver-marker='true']").count(),
    retryVisible: await page.getByRole("button", { name: "메뉴 다시 불러오기" }).isVisible(),
    injectedFailure: { route: "/api/places", status: 503 },
    unexpectedConsoleErrors: consoleErrors.filter(
      (error) => !error.includes("/api/places") && !error.includes("503"),
    ),
  }
  expect(observed).toEqual({
    error: "메뉴를 불러오지 못했어요.",
    markers: 0,
    retryVisible: true,
    injectedFailure: { route: "/api/places", status: 503 },
    unexpectedConsoleErrors: [],
  })
  await run("R09", page, testInfo, observed, consoleErrors)
})
