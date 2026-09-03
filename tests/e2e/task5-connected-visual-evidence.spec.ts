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
    const refreshLabel = refresh?.querySelector("span > span")
    const navigation = [...(header?.querySelectorAll("nav a") ?? [])]
    const filters = [...document.querySelectorAll("fieldset button")]
    const status = [...document.querySelectorAll("span")].find(
      (element) => element.textContent?.trim() === "NAVER 지도 연결됨",
    )?.parentElement
    const tray = document.querySelector<HTMLElement>("[aria-label='검색 결과 패널']")
    const trayToggle = document.querySelector<HTMLElement>("[aria-expanded='true']")
    if (
      header === null ||
      title === undefined ||
      title === null ||
      refreshLabel === undefined ||
      refreshLabel === null
    )
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
      navigationLines: navigation.map((link) => lineCount(link)),
      rasterIntent: "188 CSS pixels at DPR 2 produces a 376px proof of 375px/200% reflow",
      refreshLines: lineCount(refreshLabel),
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
  expect(zoomMetrics.navigationLines.every((count) => count === 1)).toBe(true)
  expect(zoomMetrics.titleLines).toBe(1)
  expect(zoomMetrics.refreshLines).toBe(1)
  expect(zoomMetrics.filterLines.every((count) => count === 1)).toBe(true)
  expect(zoomMetrics.filterWidths.every((width) => width >= 44)).toBe(true)
  expect(zoomMetrics.statusFullyAboveTray, JSON.stringify(zoomMetrics)).toBe(true)
  expect(zoomMetrics.statusFullyAboveTrayToggle).toBe(true)
  expect(zoomMetrics.statusLive).toBe("polite")
  expect(zoomMetrics.trayToggleTopmost).toBe(true)
  await zoomPage.screenshot({ path: testInfo.outputPath("zoom-200-list-375x812.png") })
  await zoomPage.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await expect(
    zoomPage.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await expect(zoomPage.getByRole("button", { name: "공유", exact: true })).toBeVisible()
  const zoomDetailMetrics = await zoomPage.evaluate(() => {
    const stage = document.querySelector<HTMLElement>("[data-testid='map-stage']")
    const surface = document.querySelector<HTMLElement>(
      "[aria-label='장소 상세'][data-detail-phase='open']",
    )
    const body = document.querySelector<HTMLElement>("[data-testid='place-detail-body']")
    if (stage === null || surface === null || body === null)
      throw new Error("zoom detail geometry target missing")
    const header = surface.querySelector<HTMLElement>("header")
    const actions = surface.querySelector<HTMLElement>("footer")
    if (header === null || actions === null) throw new Error("zoom detail geometry target missing")
    const stageRect = stage.getBoundingClientRect()
    const surfaceRect = surface.getBoundingClientRect()
    const headerRect = header.getBoundingClientRect()
    const actionsRect = actions.getBoundingClientRect()
    return {
      actionsWithinSurface:
        actionsRect.top >= surfaceRect.top && actionsRect.bottom <= surfaceRect.bottom,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      documentScrollY: window.scrollY,
      headerWithinSurface:
        headerRect.top >= surfaceRect.top && headerRect.bottom <= surfaceRect.bottom,
      surfaceFitsStage: surfaceRect.top >= stageRect.top && surfaceRect.bottom <= stageRect.bottom,
    }
  })
  expect(zoomDetailMetrics).toMatchObject({
    actionsWithinSurface: true,
    documentScrollY: 0,
    headerWithinSurface: true,
    surfaceFitsStage: true,
  })
  expect(zoomDetailMetrics.bodyClientHeight).toBeGreaterThanOrEqual(44)
  expect(zoomDetailMetrics.bodyScrollHeight).toBeGreaterThan(zoomDetailMetrics.bodyClientHeight)
  await zoomPage.screenshot({ path: testInfo.outputPath("zoom-200-detail-375x812.png") })
  await zoomContext.close()

  await testInfo.attach("visual-measurements", {
    body: Buffer.from(JSON.stringify({ measurements, zoomMetrics }, null, 2)),
    contentType: "application/json",
  })
})
