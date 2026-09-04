import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import type { Browser, BrowserContext, Page, TestInfo } from "@playwright/test"
import { expect, installMapTestRoutes, test } from "./map-test"

const zoomViewport = { width: 188, height: 406 } as const
const zoomPixels = { width: 376, height: 812 } as const
const insideGeolocationScript =
  "Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success){success({coords:{latitude:37.5007,longitude:127.0328},timestamp:0})}}})"
const sourcePath = new URL("./f3-matrix-r15-r19-zoom.spec.ts", import.meta.url)
const manifestRef = ".omo/evidence/f3-final/surface-matrix.json#baseline.sourceManifestSha256"
const sha256 = async (path: string | URL): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")
const pngSize = async (path: string): Promise<Readonly<{ width: number; height: number }>> => {
  const bytes = await readFile(path)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}
const monitor = (page: Page): string[] => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(`page:${error.message}`))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`)
  })
  return errors
}
const createZoomPage = async (
  browser: Browser,
  baseURL: string,
): Promise<Readonly<{ context: BrowserContext; page: Page }>> => {
  const context = await browser.newContext({
    baseURL,
    deviceScaleFactor: 2,
    viewport: zoomViewport,
  })
  await installMapTestRoutes(context)
  await context.addInitScript(insideGeolocationScript)
  return { context, page: await context.newPage() }
}
const receipt = async (
  rowId: string,
  page: Page,
  testInfo: TestInfo,
  observations: Readonly<Record<string, unknown>>,
  expectedInjected: readonly string[],
  unexpectedConsoleOrPageErrors: readonly string[],
): Promise<Readonly<{ width: number; height: number }>> => {
  const png = testInfo.outputPath(`${rowId}.png`)
  await page.screenshot({ path: png, fullPage: false })
  const physicalPixels = await pngSize(png)
  const value = {
    rowId,
    testId: testInfo.testId,
    buildId: process.env["F3_BUILD_ID"] ?? "unset",
    sourceSha256: await sha256(sourcePath),
    manifestRef,
    capturedAt: new Date().toISOString(),
    screenshotSha256: await sha256(png),
    viewport: zoomViewport,
    observations: { ...observations, physicalPixels },
    errors: { expectedInjected, unexpectedConsoleOrPageErrors },
  }
  const json = testInfo.outputPath(`${rowId}.json`)
  await writeFile(json, `${JSON.stringify(value, null, 2)}\n`)
  await testInfo.attach(`${rowId}.png`, { contentType: "image/png", path: png })
  await testInfo.attach(`${rowId}.json`, { contentType: "application/json", path: json })
  return physicalPixels
}
const requireBaseUrl = (baseURL: string | undefined): string => {
  if (baseURL === undefined) throw new TypeError("Playwright baseURL is required")
  return baseURL
}

test.describe.configure({ retries: 0 })

test("R17 true 200 percent zoom keeps normal list readable and targets large", async ({
  browser,
  baseURL,
}, testInfo) => {
  const { context, page } = await createZoomPage(browser, requireBaseUrl(baseURL))
  const errors = monitor(page)
  await page.goto("/")
  await expect(page.getByRole("list", { name: "검색 결과" })).toBeVisible()
  await expect(page.getByRole("searchbox", { name: "장소와 메뉴 검색" })).toBeVisible()
  await expect(page.locator('[data-location-state="inside"]')).toBeVisible()
  await expect(page.locator('[data-location-state="denied"]')).toHaveCount(0)
  await expect(page.getByRole("status", { name: "검색 결과 수" })).toHaveText("5곳")
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  const observations = await page.evaluate(() => {
    const search = document.querySelector<HTMLInputElement>('input[aria-label="장소와 메뉴 검색"]')
    const toggle = document.querySelector<HTMLButtonElement>("button[aria-expanded]")
    if (search === null || toggle === null) throw new TypeError("R17 normal zoom targets missing")
    const input = search.getBoundingClientRect()
    const toggleRect = toggle.getBoundingClientRect()
    const hit = document.elementFromPoint(
      toggleRect.left + toggleRect.width / 2,
      toggleRect.top + toggleRect.height / 2,
    )
    const targets = Array.from(document.querySelectorAll<HTMLElement>("button, input")).filter(
      (element) =>
        element.getClientRects().length > 0 &&
        element.closest("[data-testid='naver-map']") === null,
    )
    return {
      cssViewport: { width: innerWidth, height: innerHeight },
      deniedCount: document.querySelectorAll('[data-location-state="denied"]').length,
      resultCount: document.querySelectorAll('[data-test-naver-marker="true"]').length,
      input: { width: input.width, height: input.height },
      overflow: document.documentElement.scrollWidth > innerWidth,
      targetFailures: targets.filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width < 44 || rect.height < 44
      }).length,
      toggleTopmost: hit === toggle || toggle.contains(hit),
    }
  })
  expect(observations).toMatchObject({
    cssViewport: zoomViewport,
    deniedCount: 0,
    resultCount: 5,
    overflow: false,
    targetFailures: 0,
    toggleTopmost: true,
  })
  expect(observations.input.width).toBeGreaterThanOrEqual(44)
  expect(observations.input.height).toBeGreaterThanOrEqual(44)
  expect(errors).toEqual([])
  expect(await receipt("R17", page, testInfo, observations, [], errors)).toEqual(zoomPixels)
  await context.close()
})

test("R18 true 200 percent zoom captures settled open detail", async ({
  browser,
  baseURL,
}, testInfo) => {
  const { context, page } = await createZoomPage(browser, requireBaseUrl(baseURL))
  const errors = monitor(page)
  await page.goto("/")
  await expect(page.locator('[data-location-state="inside"]')).toBeVisible()
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  const surface = page.locator(
    "[aria-label='장소 상세'][data-detail-phase='open'][data-detail-motion='settled']",
  )
  const detail = page.getByTestId("place-detail")
  await expect(surface).toBeVisible()
  await expect(detail.getByRole("heading", { level: 2, name: "새싹 네모식당" })).toBeVisible()
  await expect(detail.getByRole("button", { name: "길찾기" })).toBeVisible()
  await expect(detail.getByRole("button", { name: "공유", exact: true })).toBeVisible()
  await expect(detail.getByRole("button", { name: "지도 공유" })).toBeVisible()
  const observations = await surface.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const heading = element.querySelector<HTMLElement>("#place-detail-title")
    const headingRect = heading?.getBoundingClientRect()
    const point = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + Math.min(12, rect.height / 2),
    )
    return {
      phase: element.getAttribute("data-detail-phase"),
      motion: element.getAttribute("data-detail-motion"),
      detailInViewport:
        rect.top >= 0 && rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      detailTopmost: point === element || element.contains(point),
      titleInViewport:
        headingRect !== undefined && headingRect.top >= 0 && headingRect.bottom <= innerHeight,
      actionsVisible: element.querySelectorAll("footer button").length === 3,
      overflow: document.documentElement.scrollWidth > innerWidth,
      soleBodyScrollOwner:
        document.querySelector<HTMLElement>("[data-testid='place-detail-body']") !== null,
    }
  })
  expect(observations).toEqual({
    phase: "open",
    motion: "settled",
    detailInViewport: true,
    detailTopmost: true,
    titleInViewport: true,
    actionsVisible: true,
    overflow: false,
    soleBodyScrollOwner: true,
  })
  expect(errors).toEqual([])
  expect(await receipt("R18", page, testInfo, observations, [], errors)).toEqual(zoomPixels)
  await context.close()
})

test("R19 true 200 percent denied attention is visible above tray", async ({
  browser,
  baseURL,
}, testInfo) => {
  const { context, page } = await createZoomPage(browser, requireBaseUrl(baseURL))
  await context.addInitScript(() =>
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
  const errors = monitor(page)
  await page.goto("/")
  const attention = page.locator('[data-location-state="denied"]')
  const retry = page.getByRole("button", { name: "현재 위치 다시 찾기" })
  await expect(attention).toBeVisible()
  await expect(attention).toHaveText("위치 권한이 거부되었습니다.")
  await expect(page.getByRole("status", { name: "검색 결과 수" })).toHaveText("전체 5곳 · 0곳 표시")
  await expect(page.getByRole("list", { name: "검색 결과" })).toHaveCount(0)
  await expect(retry).toBeVisible()
  await page.keyboard.press("Tab")
  await page.keyboard.press("Tab")
  await expect(retry).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(attention).toBeVisible()
  const observations = await page.evaluate(() => {
    const attention = document.querySelector<HTMLElement>('[data-location-state="denied"]')
    const tray = document.querySelector<HTMLElement>("[aria-label='검색 결과 패널']")
    const toggle = document.querySelector<HTMLElement>("[aria-expanded='true']")
    const retry = document.querySelector<HTMLButtonElement>(
      "button[aria-label='현재 위치 다시 찾기']",
    )
    if (attention === null || tray === null || toggle === null || retry === null)
      throw new TypeError("R19 denied zoom targets missing")
    const rect = attention.getBoundingClientRect()
    const toggleRect = toggle.getBoundingClientRect()
    const togglePoint = document.elementFromPoint(
      toggleRect.left + toggleRect.width / 2,
      toggleRect.top + toggleRect.height / 2,
    )
    return {
      deniedVisible:
        rect.width > 0 && rect.height > 0 && getComputedStyle(attention).visibility !== "hidden",
      attentionInViewport: rect.top >= 0 && rect.bottom <= innerHeight,
      attentionAboveTray: rect.bottom <= tray.getBoundingClientRect().top,
      focusReturnedToRetry: document.activeElement === retry,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
      retryTargetLarge:
        retry.getBoundingClientRect().width >= 44 && retry.getBoundingClientRect().height >= 44,
      toggleTopmost: togglePoint === toggle || toggle.contains(togglePoint),
      cssViewport: { width: innerWidth, height: innerHeight },
    }
  })
  expect(observations).toEqual({
    deniedVisible: true,
    attentionInViewport: true,
    attentionAboveTray: true,
    focusReturnedToRetry: true,
    noHorizontalOverflow: true,
    retryTargetLarge: true,
    toggleTopmost: true,
    cssViewport: zoomViewport,
  })
  expect(errors).toEqual([])
  expect(
    await receipt("R19", page, testInfo, observations, ["geolocation:PERMISSION_DENIED"], errors),
  ).toEqual(zoomPixels)
  await context.close()
})
