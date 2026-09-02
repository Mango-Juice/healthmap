import type { Route } from "@playwright/test"
import { PublicCatalogSnapshotSchema } from "../../lib/domain/catalog"
import { longKoreanTypedStress, typedLongKoreanStressCatalog } from "../fixtures/e2e-catalog"
import { measureTypedStressLayout } from "../fixtures/e2e-typed-stress-layout"
import { expect, installMapTestRoutes, test } from "./map-test"

const viewports = [
  { height: 812, name: "375x812", width: 375 },
  { height: 1024, name: "768x1024", width: 768 },
  { height: 800, name: "1280x800", width: 1280 },
] as const

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test("captures connected list and detail surfaces without provider-control overlap", async ({
  browser,
  page,
}, testInfo) => {
  const measurements: unknown[] = []
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto("/")
    await expect(page.getByText("NAVER 지도 연결됨")).toBeVisible()
    await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
    await page.screenshot({
      path: testInfo.outputPath(`connected-list-${viewport.name}.png`),
    })

    await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
    await expect(
      page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
    ).toBeVisible()
    const measurement = await page.evaluate((name) => {
      const controls = Array.from(document.querySelectorAll<HTMLElement>("button, a, input"))
        .filter((element) => element.getClientRects().length > 0)
        .filter((element) => element.closest("[data-testid='naver-map']") === null)
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return { height: rect.height, width: rect.width }
        })
      return {
        controlsMeet44: controls.every(({ height, width }) => height >= 44 && width >= 44),
        developerChromePresent: document.querySelector("nextjs-portal") !== null,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        viewport: name,
      }
    }, viewport.name)
    measurements.push(measurement)
    expect(measurement).toMatchObject({
      controlsMeet44: true,
      developerChromePresent: false,
      horizontalOverflow: false,
    })
    await page.screenshot({ path: testInfo.outputPath(`detail-${viewport.name}.png`) })
  }

  const zoomContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    deviceScaleFactor: 2,
    viewport: { height: 406, width: 188 },
  })
  await installMapTestRoutes(zoomContext)
  await zoomContext.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
  const zoomPage = await zoomContext.newPage()
  await zoomPage.goto("/")
  await expect(zoomPage.getByText("NAVER 지도 연결됨")).toBeVisible()
  await zoomPage.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  const zoomMetrics = await zoomPage.evaluate(() => {
    const lineCount = (element: Element): number => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getClientRects().length
    }
    const header = document.querySelector("header")
    const title = header?.querySelector("h1")
    const refresh = [...(header?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent?.trim() === "장소 새로고침",
    )
    const filters = [...document.querySelectorAll("fieldset button")]
    const status = [...document.querySelectorAll("span")].find(
      (element) => element.textContent?.trim() === "NAVER 지도 연결됨",
    )?.parentElement
    const tray = document.querySelector<HTMLElement>("[aria-label='검색 결과 패널']")
    const trayToggle = document.querySelector<HTMLElement>("[aria-expanded='true']")
    if (header === null || title === undefined || title === null || refresh === undefined)
      throw new Error("zoom header target missing")
    if (status === undefined || status === null || tray === null || trayToggle === null)
      throw new Error("zoom status geometry target missing")
    const statusRect = status.getBoundingClientRect()
    const trayRect = tray.getBoundingClientRect()
    const trayToggleRect = trayToggle.getBoundingClientRect()
    const trayToggleHit = document.elementFromPoint(
      trayToggleRect.left + trayToggleRect.width / 2,
      trayToggleRect.top + trayToggleRect.height / 2,
    )
    return {
      cssViewport: { height: window.innerHeight, width: window.innerWidth },
      filterLines: filters.map((filter) => {
        const label = filter.querySelector("span")
        return label === null ? 0 : lineCount(label)
      }),
      filterWidths: filters.map((filter) => filter.getBoundingClientRect().width),
      headerFits: header.scrollWidth <= header.clientWidth,
      rasterIntent: "188 CSS pixels at DPR 2 produces a 376px proof of 375px/200% reflow",
      refreshLines: lineCount(refresh),
      statusFullyAboveTray: statusRect.bottom <= trayRect.top,
      statusFullyAboveTrayToggle: statusRect.bottom <= trayToggleRect.top,
      statusLive: status.getAttribute("aria-live"),
      statusRect: statusRect.toJSON(),
      titleLines: lineCount(title),
      trayRect: trayRect.toJSON(),
      trayToggleTopmost: trayToggle === trayToggleHit || trayToggle.contains(trayToggleHit),
      trayToggleRect: trayToggleRect.toJSON(),
    }
  })
  expect(zoomMetrics.headerFits).toBe(true)
  expect(zoomMetrics.titleLines).toBe(1)
  expect(zoomMetrics.refreshLines).toBe(1)
  expect(zoomMetrics.filterLines.every((count) => count === 1)).toBe(true)
  expect(zoomMetrics.filterWidths.every((width) => width >= 44)).toBe(true)
  expect(zoomMetrics.statusFullyAboveTray).toBe(true)
  expect(zoomMetrics.statusFullyAboveTrayToggle).toBe(true)
  expect(zoomMetrics.statusLive).toBe("polite")
  expect(zoomMetrics.trayToggleTopmost).toBe(true)
  await zoomPage.screenshot({ path: testInfo.outputPath("zoom-200-list-375x812.png") })
  await zoomPage.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await expect(
    zoomPage.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await expect(zoomPage.getByRole("button", { name: "공유", exact: true })).toBeVisible()
  await zoomPage.screenshot({ path: testInfo.outputPath("zoom-200-detail-375x812.png") })
  await zoomContext.close()

  await testInfo.attach("visual-measurements", {
    body: Buffer.from(JSON.stringify({ measurements, zoomMetrics }, null, 2)),
    contentType: "application/json",
  })
})

test("renders long Korean text and an unbroken URL through the typed catalog boundary with one scroll owner", async ({
  context,
  page,
}, testInfo) => {
  await context.unroute("**/api/map-catalog")
  await context.route("**/api/map-catalog", async (route) => {
    await route.fulfill({ contentType: "application/json", json: typedLongKoreanStressCatalog })
  })
  await page.setViewportSize({ height: 812, width: 375 })
  await page.goto("/")
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/map-catalog" &&
      response.request().method() === "GET",
  )
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  const responseCatalog = PublicCatalogSnapshotSchema.parse(await (await responsePromise).json())
  expect(responseCatalog.catalogVersion).toBe(typedLongKoreanStressCatalog.catalogVersion)
  expect(
    responseCatalog.places.some(
      (place) =>
        place.address === longKoreanTypedStress.address &&
        place.name === longKoreanTypedStress.placeName,
    ),
  ).toBe(true)
  expect(
    responseCatalog.menus.some(
      (menu) =>
        menu.evidenceUrl === longKoreanTypedStress.evidenceUrl &&
        menu.name === longKoreanTypedStress.menuName,
    ),
  ).toBe(true)

  const detailButton = page.getByRole("button", {
    name: `${longKoreanTypedStress.placeName} 상세 보기`,
  })
  await expect(detailButton).toBeVisible()
  await detailButton.click()
  const detail = page.getByTestId("place-detail")
  const detailBody = page.getByTestId("place-detail-body")
  await expect(detail).toContainText(longKoreanTypedStress.placeName)
  await expect(detailBody).toContainText(longKoreanTypedStress.address)
  await expect(detailBody).toContainText(longKoreanTypedStress.menuName)
  const evidence = detailBody.locator("a").first()
  await expect(evidence).toHaveAttribute("href", longKoreanTypedStress.evidenceUrl)

  const metrics = await measureTypedStressLayout(page)
  expect(metrics).toEqual({ detailFits: true, documentFits: true, owners: ["place-detail-body"] })
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("long-korean-url-375x812.png"),
  })

  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await detailButton.click()
  await expect(detailBody).toContainText(longKoreanTypedStress.menuName)
})

test("captures distinct catalog loading empty and error surfaces", async ({ page }, testInfo) => {
  const expectFeedbackAboveTray = async (): Promise<void> => {
    const separated = await page.evaluate(() => {
      const feedback = document.querySelector<HTMLElement>("[class*='catalogFeedback']")
      const tray = document.querySelector<HTMLElement>("[aria-label='검색 결과 패널']")
      if (feedback === null || tray === null) return false
      return feedback.getBoundingClientRect().bottom <= tray.getBoundingClientRect().top
    })
    expect(separated).toBe(true)
  }
  const requests: Route[] = []
  await page.route("**/api/map-catalog", async (route) => {
    requests.push(route)
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect.poll(() => requests.length).toBe(1)
  await expect(page.getByText("장소 데이터를 불러오는 중입니다.")).toBeVisible()
  await expectFeedbackAboveTray()
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  await page.screenshot({ path: testInfo.outputPath("loading-375x812.png") })

  await requests[0]?.fulfill({
    contentType: "application/json",
    body: '{"catalogVersion":"empty-visual","dataMode":"production","menus":[],"places":[]}',
  })
  await expect(page.getByText("표시할 장소가 없습니다.")).toBeVisible()
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  await page.screenshot({ path: testInfo.outputPath("empty-375x812.png") })

  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect.poll(() => requests.length).toBe(2)
  await requests[1]?.fulfill({ status: 503 })
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toBeVisible()
  await expectFeedbackAboveTray()
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  await page.screenshot({ path: testInfo.outputPath("error-375x812.png") })
})

test("captures keyboard focus and reduced-motion detail", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: "장소 새로고침" })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath("keyboard-focus-375x812.png") })
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toHaveAttribute("data-detail-motion", "settled")
  await page.screenshot({ path: testInfo.outputPath("reduced-motion-detail-375x812.png") })
})
