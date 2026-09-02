import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import type { Page, TestInfo } from "@playwright/test"
import { e2eCatalog } from "../fixtures/e2e-catalog"
import { expect, test } from "./map-test"

const viewport = { width: 375, height: 812 } as const
const sourcePath = new URL("./f3-matrix-r10-r14.spec.ts", import.meta.url)
const manifestRef = ".omo/evidence/f3-final/surface-matrix.json#baseline.sourceManifestSha256"
const emptyCatalog =
  '{"catalogVersion":"matrix-empty","dataMode":"production","menus":[],"places":[]}'
const catalog503Console = [
  "console:Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
]
const naverAbortConsole = ["console:Failed to load resource: net::ERR_FAILED"]
const insideGeolocationScript =
  "Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success){success({coords:{latitude:37.5007,longitude:127.0328},timestamp:0})}}})"
const sha256 = async (path: string | URL): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")
const monitor = (page: Page): string[] => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(`page:${error.message}`))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`)
  })
  return errors
}
const receipt = async (
  rowId: string,
  page: Page,
  testInfo: TestInfo,
  observations: Readonly<Record<string, unknown>>,
  expectedInjected: readonly string[],
  unexpectedConsoleOrPageErrors: readonly string[],
): Promise<string> => {
  const png = testInfo.outputPath(`${rowId}.png`)
  await page.screenshot({ path: png, fullPage: false })
  const value = {
    rowId,
    testId: testInfo.testId,
    buildId: process.env["F3_BUILD_ID"] ?? "unset",
    sourceSha256: await sha256(sourcePath),
    manifestRef,
    capturedAt: new Date().toISOString(),
    screenshotSha256: await sha256(png),
    viewport,
    observations,
    errors: { expectedInjected, unexpectedConsoleOrPageErrors },
  }
  const json = testInfo.outputPath(`${rowId}.json`)
  await writeFile(json, `${JSON.stringify(value, null, 2)}\n`)
  await testInfo.attach(`${rowId}.png`, { contentType: "image/png", path: png })
  await testInfo.attach(`${rowId}.json`, { contentType: "application/json", path: json })
  return value.screenshotSha256
}

test.describe.configure({ retries: 0 })
let r10ScreenshotSha256: string | undefined

test.beforeEach(async ({ page }) => page.addInitScript(insideGeolocationScript))

test("R10 catalog 503 then empty then fixture recovery", async ({ page }, testInfo) => {
  const errors = monitor(page)
  let attempts = 0
  await page.route("**/api/map-catalog", async (route) => {
    attempts += 1
    if (attempts === 1) return route.fulfill({ status: 503 })
    if (attempts === 2)
      return route.fulfill({ contentType: "application/json", body: emptyCatalog })
    return route.fulfill({ contentType: "application/json", json: e2eCatalog })
  })
  await page.setViewportSize(viewport)
  await page.goto("/")
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toBeVisible()
  await page.getByRole("button", { name: /다시 시도/ }).click()
  await expect(page.getByText("표시할 장소가 없습니다.")).toBeVisible()
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await expect(page.locator('[data-location-state="inside"]')).toBeVisible()
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toHaveCount(0)
  expect(errors).toEqual(catalog503Console)
  r10ScreenshotSha256 = await receipt(
    "R10",
    page,
    testInfo,
    { attempts, error: false, empty: false, markerCount: 5, injectedRouteStatuses: [503] },
    catalog503Console,
    [],
  )
})

test("R11 newer empty response wins over stale older 503", async ({ page }, testInfo) => {
  const errors = monitor(page)
  const requests: Array<import("@playwright/test").Route> = []
  await page.route("**/api/map-catalog", async (route) => requests.push(route))
  await page.setViewportSize(viewport)
  await page.goto("/")
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect.poll(() => requests.length).toBe(2)
  await requests[1]?.fulfill({ contentType: "application/json", body: emptyCatalog })
  await expect(page.getByText("표시할 장소가 없습니다.")).toBeVisible()
  await requests[0]?.fulfill({ status: 503 })
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toHaveCount(0)
  const observations = {
    requestCount: requests.length,
    emptyVisible: true,
    staleErrorVisible: false,
    markerCount: 0,
  }
  expect(errors).toEqual(catalog503Console)
  await receipt(
    "R11",
    page,
    testInfo,
    { ...observations, injectedRouteStatuses: [503] },
    catalog503Console,
    [],
  )
})

test("R12 NAVER SDK error replaces map with truthful alert", async ({ page }, testInfo) => {
  const errors = monitor(page)
  await page.route("https://oapi.map.naver.com/**", async (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  )
  await page.setViewportSize(viewport)
  await page.goto("/")
  await expect(page.locator('[role="alert"][data-tone="error"]')).toBeVisible()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(0)
  await expect(page.getByText("NAVER 지도 연결됨")).toHaveCount(0)
  expect(errors).toEqual([])
  await receipt(
    "R12",
    page,
    testInfo,
    { alert: true, markerCount: 0, connected: false },
    ["naver-sdk:error"],
    errors,
  )
})

test("R13 NAVER SDK retry restores native markers", async ({ page }, testInfo) => {
  const errors = monitor(page)
  let attempts = 0
  await page.route("https://oapi.map.naver.com/**", async (route) => {
    attempts += 1
    if (attempts === 1) return route.abort()
    await route.fulfill({
      contentType: "text/javascript",
      body: "(()=>{class LatLng{constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}lat(){return this.latitude}lng(){return this.longitude}}class Map{constructor(element,options){this.element=element;this.center=options.center;this.bounds={getSW:()=>new LatLng(37.492,127.02),getNE:()=>new LatLng(37.5085,127.0445)};element.innerHTML='<canvas data-test-naver-map></canvas>'}getBounds(){return this.bounds}getCenter(){return this.center}destroy(){}}class Marker{constructor(options){this.element=document.createElement('button');this.element.ariaLabel=options.title;this.element.dataset.testNaverMarker='true';options.map.element.append(this.element)}setMap(map){if(map===null)this.element.remove()}}const Event={addListener(target,name,listener){if(name==='tilesloaded')queueMicrotask(listener);return{target,name,listener}},removeListener(){}};window.naver={maps:{LatLng,Map,Marker,Event}}})()",
    })
  })
  await page.setViewportSize(viewport)
  await page.goto("/")
  await expect(page.getByText("NAVER 지도를 불러올 수 없습니다.")).toBeVisible()
  await page.getByRole("button", { name: "다시 시도" }).click()
  await expect(page.getByTestId("map-stage")).toHaveAttribute("data-adapter-state", "ready")
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  expect(errors).toEqual(naverAbortConsole)
  await receipt(
    "R13",
    page,
    testInfo,
    { attempts, adapterState: "ready", markerCount: 5, injectedAbortCount: 1 },
    naverAbortConsole,
    [],
  )
})

test("R14 denied location retains map and visible attention", async ({ page }, testInfo) => {
  const errors = monitor(page)
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
          failure({
            code: 1,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          }),
      },
    }),
  )
  await page.setViewportSize(viewport)
  await page.goto("/")
  const attention = page.locator('[data-location-state="denied"]')
  await expect(attention).toBeVisible()
  await expect(page.getByTestId("map-stage")).toBeVisible()
  await expect(page.getByRole("img", { name: "내 위치" })).toHaveCount(0)
  const observations = await page.evaluate(() => {
    const attention = document.querySelector<HTMLElement>('[data-location-state="denied"]')
    const tray = document.querySelector<HTMLElement>("[aria-label='검색 결과 패널']")
    if (attention === null || tray === null) throw new TypeError("R14 attention geometry missing")
    const rect = attention.getBoundingClientRect()
    const point = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const map = document.querySelector<HTMLElement>("[data-testid='map-stage']")
    const mapRect = map?.getBoundingClientRect()
    return {
      deniedVisible:
        rect.width > 0 && rect.height > 0 && getComputedStyle(attention).visibility !== "hidden",
      attentionInViewport: rect.top >= 0 && rect.bottom <= innerHeight,
      attentionTopmost: point === attention || attention.contains(point),
      attentionAboveTray: rect.bottom <= tray.getBoundingClientRect().top,
      locationMarkerCount: document.querySelectorAll('[aria-label="내 위치"]').length,
      mapVisible: mapRect !== undefined && mapRect.width > 0 && mapRect.height > 0,
    }
  })
  expect(observations).toMatchObject({
    deniedVisible: true,
    attentionInViewport: true,
    attentionTopmost: true,
    attentionAboveTray: true,
    locationMarkerCount: 0,
    mapVisible: true,
  })
  expect(errors).toEqual([])
  const r14ScreenshotSha256 = await receipt(
    "R14",
    page,
    testInfo,
    observations,
    ["geolocation:PERMISSION_DENIED"],
    errors,
  )
  if (r10ScreenshotSha256 === undefined) throw new TypeError("R10 screenshot hash missing")
  expect(r14ScreenshotSha256).not.toBe(r10ScreenshotSha256)
})
