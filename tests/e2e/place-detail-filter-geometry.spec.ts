import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test.describe.configure({ retries: 0 })

test("open 768 pane keeps the fifth filter natively hit-testable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  await page.screenshot({
    path: testInfo.outputPath("baseline-768x1024-default.png"),
  })
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  const fifth = page.getByRole("button", { name: "식물성 필터" })
  const hit = await fifth.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return {
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      filterRect: rect.toJSON(),
      targetId: target?.id ?? null,
      targetTag: target?.tagName ?? null,
      targetTestId: target?.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
      targetIsFilter: target === element || element.contains(target),
    }
  })
  await page.screenshot({
    path: testInfo.outputPath("baseline-768x1024-open.png"),
  })
  expect(hit.targetIsFilter).toBe(true)
})
test("768 split-pane acceptance keeps every filter stable through opening and restore", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  await expect(page.getByText("NAVER 지도 연결됨")).toBeVisible()
  const map = page.getByTestId("map-stage")
  const rail = map.locator("fieldset")
  const filters = rail.getByRole("button")
  const resultCard = page.getByRole("button", { name: "구름 도시락 공방 상세 보기" })
  const capture = async () =>
    page.evaluate(() => {
      const mapElement = document.querySelector<HTMLElement>("[data-testid='map-stage']")
      const railElement = mapElement?.querySelector<HTMLElement>("fieldset")
      const pane = document.querySelector<HTMLElement>(
        "[data-detail-phase]:not([data-testid='map-stage'])",
      )
      const mapRect = mapElement
        ?.querySelector("[data-testid='naver-map']")
        ?.getBoundingClientRect()
      const paneRect = pane?.getBoundingClientRect()
      const filters = [...document.querySelectorAll<HTMLElement>("fieldset button")].map(
        (element) => {
          const rect = element.getBoundingClientRect()
          const target = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          )
          return {
            center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
            visible:
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              rect.top >= 0 &&
              rect.bottom <= innerHeight,
            nativeHit: target === element || element.contains(target),
            pressed: element.getAttribute("aria-pressed"),
          }
        },
      )
      return {
        mapScrollLeft: mapElement?.scrollLeft ?? -1,
        railScrollLeft: railElement?.scrollLeft ?? -1,
        mapRight: mapRect?.right ?? -1,
        paneLeft: paneRect?.left ?? innerWidth,
        paneRight: paneRect?.right ?? -1,
        filters,
      }
    })
  const closed = await capture()
  await expect(closed.mapScrollLeft).toBe(0)
  await resultCard.click()
  await page.waitForTimeout(20)
  const opening = await capture()
  await expect(
    page.locator(
      "[data-detail-phase='opening']:not([data-testid='map-stage']), [data-detail-phase='open']:not([data-testid='map-stage'])",
    ),
  ).toBeVisible()
  await page.waitForTimeout(280)
  const settled = await capture()
  await page.screenshot({ path: testInfo.outputPath("final-768-settled.png") })
  const states = [closed, opening, settled]
  for (const state of states) {
    expect(state.mapScrollLeft).toBe(0)
    expect(state.railScrollLeft).toBe(closed.railScrollLeft)
    expect(state.filters.every(({ visible, nativeHit }) => visible && nativeHit)).toBe(true)
  }
  expect(settled.paneLeft).toBeGreaterThanOrEqual(settled.mapRight)
  expect(settled.paneRight).toBeGreaterThan(settled.paneLeft)
  for (let index = 0; index < 5; index += 1) {
    await filters.nth(index).click()
    await expect(filters.nth(index)).toHaveAttribute("aria-pressed", "true")
    const afterFilter = await capture()
    expect(afterFilter.mapScrollLeft).toBe(0)
    expect(afterFilter.filters.every(({ visible, nativeHit }) => visible && nativeHit)).toBe(true)
  }
  await filters.nth(0).click()
  await expect(filters.nth(0)).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await page.waitForTimeout(300)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  const restored = await capture()
  expect(restored.mapScrollLeft).toBe(0)
  expect(restored.filters.every(({ visible, nativeHit }) => visible && nativeHit)).toBe(true)
  await expect(resultCard).toBeFocused()
})
test("768 closed map stays map-first and keeps every Korean filter label on one line", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  const map = page.getByTestId("map-stage")
  const layout = await map.evaluate((element) => {
    const paper = element.querySelector<HTMLElement>("[data-testid='naver-map']")
    const buttons = [...element.querySelectorAll<HTMLButtonElement>("fieldset button")]
    return {
      detailCount: element.querySelectorAll("[data-detail-phase]").length,
      mapScrollLeft: element.scrollLeft,
      paperWidth: paper?.getBoundingClientRect().width ?? 0,
      viewportWidth: element.getBoundingClientRect().width,
      labelsSingleLine: buttons.every((button) => {
        const label = button.querySelector("span")
        if (label === null) return false
        const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight)
        return label.getBoundingClientRect().height <= lineHeight * 1.1
      }),
    }
  })
  expect(layout.detailCount).toBe(0)
  expect(layout.mapScrollLeft).toBe(0)
  expect(layout.paperWidth).toBe(layout.viewportWidth - 352)
  expect(layout.labelsSingleLine).toBe(true)
})
